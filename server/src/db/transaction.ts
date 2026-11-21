/**
 * Помощники для работы с транзакциями PostgreSQL.
 */

import type { Pool, PoolClient } from 'pg';
import { ConflictError, RetryableConflict } from '../utils/errors.js';

/** Операция, выполняемая внутри транзакции на одном и том же клиенте */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Выполнить операцию в одной транзакции.
 *
 * Порядок: получить клиента, BEGIN, SET LOCAL lock_timeout = 5 с,
 * выполнить операцию на этом клиенте, COMMIT. При ошибке выполняется ROLLBACK
 * и пробрасывается исходная ошибка. Если сам ROLLBACK не удался, соединение
 * уничтожается, а не возвращается в пул. Клиент освобождается ровно один раз.
 */
export async function withTransaction<T>(
  pool: Pool,
  callback: TransactionCallback<T>
): Promise<T> {
  const client = await pool.connect();
  // Если откат не удался, соединение могло сломаться и не должно вернуться в пул
  let brokenConnection: Error | undefined;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnection =
        rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    // Исходная ошибка важнее ошибки отката
    throw error;
  } finally {
    client.release(brokenConnection);
  }
}

/** Коды SQLSTATE, при которых транзакцию имеет смысл повторить */
const RETRYABLE_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

/** Максимальное число попыток выполнения операции */
export const MAX_ATTEMPTS = 3;

/**
 * Паузы между попытками в миллисекундах.
 * При трёх попытках используются первые две (100 и 200 мс).
 */
const BACKOFF_MS = [100, 200, 400];

export type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Определить, можно ли повторить транзакцию после этой ошибки */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableConflict) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && RETRYABLE_SQLSTATES.has(code);
  }
  return false;
}

/**
 * Выполнить операцию в транзакции с повтором при конфликтах.
 *
 * Каждая попытка начинает новую транзакцию. Повторяются только ошибки
 * 40001, 40P01 и RetryableConflict; остальные ошибки пробрасываются сразу.
 * Если попытки исчерпаны, выбрасывается ConflictError (HTTP 409).
 */
export async function withRetry<T>(
  pool: Pool,
  callback: TransactionCallback<T>,
  sleep: Sleep = defaultSleep
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(pool, callback);
    } catch (error) {
      if (!isRetryableError(error)) {
        throw error;
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new ConflictError(
          'Не удалось выполнить операцию из-за параллельных изменений. Повторите попытку.'
        );
      }
      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }
}