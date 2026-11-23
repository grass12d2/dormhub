/**
 * Сервис учётной записи: смена пароля.
 * Проверка старого пароля, запись нового хеша и аудит выполняются в одной транзакции.
 */

import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  BadRequestError,
  NotFoundError,
  TooManyRequestsError,
  UnprocessableError,
} from '../utils/errors.js';
import {
  DEFAULT_BCRYPT_ROUNDS,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../utils/password.js';
import { FailureLimiter } from '../utils/rate-limit.js';
import type { ChangePasswordInput } from '../validation/account.validation.js';
import type { ActionContext } from './buildings.service.js';

export const PASSWORD_FAILURE_LIMIT = 5;
export const PASSWORD_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export interface AccountServiceOptions {
  bcryptRounds?: number;
  /** Источник времени для ограничителя (подменяется в тестах) */
  now?: () => number;
}

export class AccountService {
  private readonly bcryptRounds: number;
  private readonly limiter: FailureLimiter;

  constructor(
    private readonly pool: Pool,
    options: AccountServiceOptions = {}
  ) {
    this.bcryptRounds = options.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS;
    this.limiter = new FailureLimiter(
      PASSWORD_FAILURE_LIMIT,
      PASSWORD_FAILURE_WINDOW_MS,
      options.now ?? Date.now
    );
  }

  async changePassword(input: ChangePasswordInput, ctx: ActionContext): Promise<void> {
    if (this.limiter.isBlocked(ctx.userId)) {
      throw new TooManyRequestsError('Слишком много неудачных попыток. Повторите позже.');
    }
    const policy = validatePasswordPolicy(input.newPassword);
    if (policy) {
      throw new BadRequestError(policy);
    }
    if (input.newPassword === input.currentPassword) {
      throw new BadRequestError('Новый пароль должен отличаться от текущего');
    }

    await withRetry(this.pool, async (client) => {
      const found = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
        [ctx.userId]
      );
      const row = found.rows[0];
      if (!row) {
        throw new NotFoundError('Пользователь не найден');
      }
      if (!(await verifyPassword(input.currentPassword, row.password_hash))) {
        this.limiter.recordFailure(ctx.userId);
        throw new UnprocessableError('Неверный текущий пароль');
      }

      const hash = await hashPassword(input.newPassword, this.bcryptRounds);
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [ctx.userId, hash]);
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'change_password',
        entityType: 'users',
        entityId: ctx.userId,
        details: {},
        ipAddress: ctx.ip,
      });
    });
    this.limiter.reset(ctx.userId);
  }
}