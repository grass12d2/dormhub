/**
 * Создание учётных записей.
 * Запись пользователя и запись аудита выполняются в одной транзакции.
 */

import type { Pool } from 'pg';
import { UserQueries } from '../db/queries/users.js';
import { withTransaction } from '../db/transaction.js';
import type { AuthenticatedUser, UserRole } from '../types/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { BadRequestError, ConflictError } from '../utils/errors.js';
import {
  DEFAULT_BCRYPT_ROUNDS,
  hashPassword,
  validatePasswordPolicy,
} from '../utils/password.js';
import { emailSchema } from '../validation/auth.validation.js';

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
}

export interface CreateUserOptions {
  /** Автор действия для журнала аудита; null — действие без пользователя */
  actorUserId?: string | null;
  bcryptRounds?: number;
}

/** Нарушение уникальности email */
function isDuplicateEmail(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const details = error as { code?: unknown; constraint?: unknown };
  return details.code === '23505' && details.constraint === 'users_email_key';
}

export async function createUser(
  pool: Pool,
  input: CreateUserInput,
  options: CreateUserOptions = {}
): Promise<AuthenticatedUser> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) {
    throw new BadRequestError('Некорректный адрес электронной почты');
  }

  const policyError = validatePasswordPolicy(input.password);
  if (policyError) {
    throw new BadRequestError(policyError);
  }

  const passwordHash = await hashPassword(
    input.password,
    options.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS
  );

  try {
    return await withTransaction(pool, async (client) => {
      const user = await new UserQueries(client).create(email.data, passwordHash, input.role);

      await writeAuditLog(client, {
        actorUserId: options.actorUserId ?? null,
        action: 'create_user',
        entityType: 'users',
        entityId: user.id,
        details: { email: user.email, role: user.role },
      });

      return { id: user.id, email: user.email, role: user.role };
    });
  } catch (error) {
    if (isDuplicateEmail(error)) {
      throw new ConflictError('Пользователь с таким email уже существует');
    }
    throw error;
  }
}