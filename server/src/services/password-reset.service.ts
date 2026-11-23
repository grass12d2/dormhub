/**
 * Восстановление пароля по коду из письма.
 * Ответ на запрос кода не зависит от того, существует ли email.
 * Проверка кода и счётчик неверных попыток фиксируются отдельной транзакцией,
 * чтобы ошибка не откатила учёт попыток; смена пароля с аудитом — второй транзакцией.
 */

import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import { writeAuditLog } from '../utils/audit.js';
import { BadRequestError, TooManyRequestsError } from '../utils/errors.js';
import { DEFAULT_BCRYPT_ROUNDS, hashPassword, validatePasswordPolicy } from '../utils/password.js';
import { FailureLimiter } from '../utils/rate-limit.js';
import {
  RESET_CODE_TTL_MS,
  RESET_MAX_ATTEMPTS,
  generateResetCode,
  hashResetCode,
  verifyResetCode,
} from '../utils/reset-code.js';
import type { Mailer } from './mailer.js';

export const FORGOT_REQUEST_LIMIT = 3;
export const FORGOT_WINDOW_MS = 15 * 60 * 1000;
export const FORGOT_MESSAGE = 'Если такой email зарегистрирован, на него отправлен код';
export const INVALID_CODE_MESSAGE = 'Неверный или просроченный код';

export interface PasswordResetOptions {
  /** Секрет для HMAC кода (берётся из JWT_SECRET с суффиксом) */
  secret: string;
  mailer: Mailer;
  bcryptRounds?: number;
  now?: () => number;
}

export class PasswordResetService {
  private readonly secret: string;
  private readonly bcryptRounds: number;
  private readonly emailLimiter: FailureLimiter;
  private readonly ipLimiter: FailureLimiter;

  constructor(
    private readonly pool: Pool,
    private readonly options: PasswordResetOptions
  ) {
    this.secret = `${options.secret}:password-reset`;
    this.bcryptRounds = options.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS;
    const now = options.now ?? Date.now;
    this.emailLimiter = new FailureLimiter(FORGOT_REQUEST_LIMIT, FORGOT_WINDOW_MS, now);
    this.ipLimiter = new FailureLimiter(FORGOT_REQUEST_LIMIT * 10, FORGOT_WINDOW_MS, now);
  }

  /** Запрос кода: каждый запрос учитывается в лимите независимо от результата */
  async requestCode(email: string, ip: string): Promise<string> {
    if (this.emailLimiter.isBlocked(email) || this.ipLimiter.isBlocked(ip)) {
      throw new TooManyRequestsError('Слишком много запросов. Повторите позже.');
    }
    this.emailLimiter.recordFailure(email);
    this.ipLimiter.recordFailure(ip);

    const found = await this.pool.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 AND is_active',
      [email]
    );
    const user = found.rows[0];
    if (!user) {
      return FORGOT_MESSAGE;
    }

    const code = generateResetCode();
    await withRetry(this.pool, async (client) => {
      // Прежний неиспользованный код заменяется новым
      await client.query(
        'UPDATE password_reset_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );
      await client.query(
        `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
         VALUES ($1, $2, now() + ($3::text || ' milliseconds')::interval)`,
        [user.id, hashResetCode(code, this.secret), String(RESET_CODE_TTL_MS)]
      );
    });
    await this.options.mailer.send({
      to: email,
      subject: 'DormHub: код восстановления пароля',
      text: `Ваш код: ${code}\nОн действует 10 минут. Если вы не запрашивали код, проигнорируйте письмо.`,
    });
    return FORGOT_MESSAGE;
  }

  /**
   * Транзакция 1: проверить код. Неверный код увеличивает счётчик (на пятой
   * ошибке код гасится) и возвращается как результат, а не как исключение.
   */
  private async checkCode(email: string, code: string): Promise<string | null> {
    return withRetry(this.pool, async (client) => {
      const found = await client.query<{
        id: number;
        user_id: string;
        code_hash: string;
        attempts: number;
        valid: boolean;
      }>(
        `SELECT c.id, c.user_id, c.code_hash, c.attempts, c.expires_at > now() AS valid
         FROM password_reset_codes c JOIN users u ON u.id = c.user_id
         WHERE u.email = $1 AND u.is_active AND c.used_at IS NULL
         FOR UPDATE OF c`,
        [email]
      );
      const row = found.rows[0];
      if (!row || !row.valid || row.attempts >= RESET_MAX_ATTEMPTS) {
        return null;
      }
      if (!verifyResetCode(code, row.code_hash, this.secret)) {
        await client.query(
          `UPDATE password_reset_codes SET attempts = attempts + 1,
             used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE NULL END
           WHERE id = $1`,
          [row.id, RESET_MAX_ATTEMPTS]
        );
        return null;
      }
      return row.user_id;
    });
  }

  /** Смена пароля по коду; все ошибки кода выглядят одинаково */
  async reset(email: string, code: string, newPassword: string, ip: string): Promise<void> {
    const policy = validatePasswordPolicy(newPassword);
    if (policy) {
      throw new BadRequestError(policy);
    }
    const userId = await this.checkCode(email, code);
    if (!userId) {
      throw new BadRequestError(INVALID_CODE_MESSAGE);
    }
    const newHash = await hashPassword(newPassword, this.bcryptRounds);

    await withRetry(this.pool, async (client) => {
      // Повторная защита от гонки: код гасится только один раз
      const used = await client.query(
        `UPDATE password_reset_codes SET used_at = now()
         WHERE user_id = $1 AND used_at IS NULL`,
        [userId]
      );
      if ((used.rowCount ?? 0) === 0) {
        throw new BadRequestError(INVALID_CODE_MESSAGE);
      }
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, newHash]);
      await writeAuditLog(client, {
        actorUserId: userId,
        action: 'reset_password',
        entityType: 'users',
        entityId: userId,
        details: {},
        ipAddress: ip,
      });
    });
  }
}