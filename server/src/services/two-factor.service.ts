/**
 * Двухфакторная аутентификация (TOTP).
 * Секрет хранится зашифрованным; код нельзя использовать повторно (last_step);
 * коды восстановления одноразовые и хранятся как хеши.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  BadRequestError,
  ConflictError,
  TooManyRequestsError,
  UnprocessableError,
} from '../utils/errors.js';
import { verifyPassword } from '../utils/password.js';
import { FailureLimiter } from '../utils/rate-limit.js';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from '../utils/totp.js';
import type { ActionContext } from './buildings.service.js';

export const TWO_FACTOR_FAILURE_LIMIT = 5;
export const TWO_FACTOR_WINDOW_MS = 15 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 8;
const INVALID_CODE = 'Неверный код';

export interface TwoFactorOptions {
  /** Секрет приложения: из него выводится ключ шифрования */
  secret: string;
  now?: () => number;
}

const hashRecovery = (code: string) =>
  createHash('sha256').update(code.replace(/-/g, '').toLowerCase()).digest('hex');

/** Код восстановления вида «abcd-ef12-3456» */
function newRecoveryCode(): string {
  const hex = randomBytes(6).toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export class TwoFactorService {
  private readonly now: () => number;
  private readonly limiter: FailureLimiter;

  constructor(
    private readonly pool: Pool,
    private readonly options: TwoFactorOptions
  ) {
    this.now = options.now ?? Date.now;
    this.limiter = new FailureLimiter(TWO_FACTOR_FAILURE_LIMIT, TWO_FACTOR_WINDOW_MS, this.now);
  }

  async isEnabled(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ enabled: boolean }>(
      'SELECT enabled FROM user_two_factor WHERE user_id = $1',
      [userId]
    );
    return result.rows[0]?.enabled === true;
  }

  async status(userId: string): Promise<{ enabled: boolean; recoveryLeft: number }> {
    const left = await this.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM two_factor_recovery_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    return { enabled: await this.isEnabled(userId), recoveryLeft: left.rows[0].n };
  }

  /** Начало включения: новый секрет (ещё не действует до подтверждения кодом) */
  async setup(userId: string, email: string): Promise<{ secret: string; otpauthUrl: string }> {
    if (await this.isEnabled(userId)) {
      throw new ConflictError('Двухфакторная защита уже включена');
    }
    const secret = generateTotpSecret();
    await this.pool.query(
      `INSERT INTO user_two_factor (user_id, secret_enc, enabled, last_step)
       VALUES ($1, $2, false, 0)
       ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc,
         enabled = false, last_step = 0, enabled_at = NULL`,
      [userId, encryptSecret(secret, this.options.secret)]
    );
    return { secret, otpauthUrl: otpauthUrl(secret, email) };
  }

  /** Подтверждение первым кодом: включает защиту и выдаёт коды восстановления (один раз) */
  async enable(code: string, ctx: ActionContext): Promise<string[]> {
    this.guard(ctx.userId);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    const ok = await withRetry(this.pool, async (client) => {
      const found = await client.query<{ secret_enc: string; enabled: boolean; last_step: string }>(
        'SELECT secret_enc, enabled, last_step FROM user_two_factor WHERE user_id = $1 FOR UPDATE',
        [ctx.userId]
      );
      const row = found.rows[0];
      if (!row) {
        throw new UnprocessableError('Сначала начните настройку двухфакторной защиты');
      }
      if (row.enabled) {
        throw new ConflictError('Двухфакторная защита уже включена');
      }
      const step = verifyTotp(
        decryptSecret(row.secret_enc, this.options.secret),
        code,
        this.now(),
        Number(row.last_step)
      );
      if (step === null) {
        return false;
      }
      await client.query(
        'UPDATE user_two_factor SET enabled = true, enabled_at = now(), last_step = $2 WHERE user_id = $1',
        [ctx.userId, step]
      );
      await client.query('DELETE FROM two_factor_recovery_codes WHERE user_id = $1', [ctx.userId]);
      for (const recovery of codes) {
        await client.query(
          'INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES ($1, $2)',
          [ctx.userId, hashRecovery(recovery)]
        );
      }
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'enable_two_factor',
        entityType: 'users',
        entityId: ctx.userId,
        details: {},
        ipAddress: ctx.ip,
      });
      return true;
    });
    if (!ok) {
      this.limiter.recordFailure(ctx.userId);
      throw new BadRequestError(INVALID_CODE);
    }
    this.limiter.reset(ctx.userId);
    return codes;
  }

  /** Проверка кода при входе или сбросе пароля: TOTP или код восстановления */
  async verifyLoginCode(userId: string, code: string): Promise<boolean> {
    this.guard(userId);
    const normalized = code.trim();
    const ok = await withRetry(this.pool, async (client) => {
      const found = await client.query<{ secret_enc: string; last_step: string }>(
        'SELECT secret_enc, last_step FROM user_two_factor WHERE user_id = $1 AND enabled FOR UPDATE',
        [userId]
      );
      const row = found.rows[0];
      if (!row) {
        return false;
      }
      if (/^\d{6}$/.test(normalized)) {
        const step = verifyTotp(
          decryptSecret(row.secret_enc, this.options.secret),
          normalized,
          this.now(),
          Number(row.last_step)
        );
        if (step === null) {
          return false;
        }
        await client.query('UPDATE user_two_factor SET last_step = $2 WHERE user_id = $1', [
          userId,
          step,
        ]);
        return true;
      }
      const used = await client.query(
        `UPDATE two_factor_recovery_codes SET used_at = now()
         WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
        [userId, hashRecovery(normalized)]
      );
      return (used.rowCount ?? 0) > 0;
    });
    if (!ok) {
      this.limiter.recordFailure(userId);
      return false;
    }
    this.limiter.reset(userId);
    return true;
  }

  /** Отключение: нужны текущий пароль и код */
  async disable(password: string, code: string, ctx: ActionContext): Promise<void> {
    const found = await this.pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [ctx.userId]
    );
    const hash = found.rows[0]?.password_hash;
    if (!hash || !(await verifyPassword(password, hash))) {
      this.limiter.recordFailure(ctx.userId);
      throw new UnprocessableError('Неверный текущий пароль');
    }
    if (!(await this.verifyLoginCode(ctx.userId, code))) {
      throw new BadRequestError(INVALID_CODE);
    }
    await withRetry(this.pool, async (client) => {
      await client.query('DELETE FROM user_two_factor WHERE user_id = $1', [ctx.userId]);
      await client.query('DELETE FROM two_factor_recovery_codes WHERE user_id = $1', [ctx.userId]);
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'disable_two_factor',
        entityType: 'users',
        entityId: ctx.userId,
        details: {},
        ipAddress: ctx.ip,
      });
    });
  }

  private guard(userId: string): void {
    if (this.limiter.isBlocked(userId)) {
      throw new TooManyRequestsError('Слишком много неверных кодов. Повторите позже.');
    }
  }
}