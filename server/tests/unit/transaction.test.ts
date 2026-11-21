import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { withRetry, withTransaction } from '../../src/db/transaction.js';
import { ConflictError, RetryableConflict } from '../../src/utils/errors.js';

/** Поддельный пул: записывает SQL-запросы и вызовы release */
function createFakePool(failOnSql?: string) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql === failOnSql) {
        throw new Error(`Сбой запроса: ${sql}`);
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const connect = vi.fn(async () => client);
  return { pool: { connect } as unknown as Pool, client, connect, queries };
}

/** Ошибка с кодом SQLSTATE, как у драйвера pg */
function pgError(code: string): Error {
  return Object.assign(new Error(`Ошибка PostgreSQL ${code}`), { code });
}

const BEGIN_SQL = ['BEGIN', "SET LOCAL lock_timeout = '5s'"];

describe('withTransaction', () => {
  it('выполняет BEGIN, SET LOCAL и COMMIT и один раз освобождает клиента', async () => {
    const { pool, client, queries } = createFakePool();

    const result = await withTransaction(pool, async () => 'готово');

    expect(result).toBe('готово');
    expect(queries).toEqual([...BEGIN_SQL, 'COMMIT']);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0][0]).toBeUndefined();
  });

  it('передаёт в операцию того же клиента, которого получил из пула', async () => {
    const { pool, client } = createFakePool();
    let received: unknown;

    await withTransaction(pool, async (transactionClient) => {
      received = transactionClient;
    });

    expect(received).toBe(client);
  });

  it('при ошибке выполняет ROLLBACK без COMMIT и пробрасывает исходную ошибку', async () => {
    const { pool, client, queries } = createFakePool();
    const original = new Error('Исходная ошибка');

    await expect(
      withTransaction(pool, async () => {
        throw original;
      })
    ).rejects.toBe(original);

    expect(queries).toEqual([...BEGIN_SQL, 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0][0]).toBeUndefined();
  });

  it('если ROLLBACK не удался, уничтожает соединение и сохраняет исходную ошибку', async () => {
    const { pool, client } = createFakePool('ROLLBACK');
    const original = new Error('Исходная ошибка');

    await expect(
      withTransaction(pool, async () => {
        throw original;
      })
    ).rejects.toBe(original);

    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('если COMMIT не удался, откатывает транзакцию и освобождает клиента', async () => {
    const { pool, client, queries } = createFakePool('COMMIT');

    await expect(withTransaction(pool, async () => 'готово')).rejects.toThrow(
      'Сбой запроса: COMMIT'
    );

    expect(queries).toEqual([...BEGIN_SQL, 'COMMIT', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry', () => {
  it.each(['40001', '40P01'])('повторяет транзакцию при SQLSTATE %s', async (code) => {
    const { pool, connect } = createFakePool();
    const sleep = vi.fn(async (_ms: number): Promise<void> => undefined);
    let calls = 0;

    const result = await withRetry(
      pool,
      async () => {
        calls++;
        if (calls === 1) {
          throw pgError(code);
        }
        return 'успех';
      },
      sleep
    );

    expect(result).toBe('успех');
    expect(calls).toBe(2);
    // Каждая попытка берёт клиента и начинает новую транзакцию
    expect(connect).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[100]]);
  });

  it('повторяет транзакцию при RetryableConflict', async () => {
    const { pool } = createFakePool();
    const sleep = vi.fn(async (_ms: number): Promise<void> => undefined);
    let calls = 0;

    const result = await withRetry(
      pool,
      async () => {
        calls++;
        if (calls === 1) {
          throw new RetryableConflict();
        }
        return 'успех';
      },
      sleep
    );

    expect(result).toBe('успех');
    expect(calls).toBe(2);
  });

  it.each([
    ['нарушение уникальности 23505', pgError('23505')],
    ['обычная ошибка', new Error('Бизнес-ошибка')],
  ])('не повторяет транзакцию: %s', async (_name, error) => {
    const { pool, connect } = createFakePool();
    const sleep = vi.fn(async (_ms: number): Promise<void> => undefined);
    let calls = 0;

    await expect(
      withRetry(
        pool,
        async () => {
          calls++;
          throw error;
        },
        sleep
      )
    ).rejects.toBe(error);

    expect(calls).toBe(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('после трёх неудачных попыток выбрасывает ConflictError с паузами 100 и 200 мс', async () => {
    const { pool, connect } = createFakePool();
    const sleep = vi.fn(async (_ms: number): Promise<void> => undefined);
    let calls = 0;

    await expect(
      withRetry(
        pool,
        async () => {
          calls++;
          throw pgError('40001');
        },
        sleep
      )
    ).rejects.toBeInstanceOf(ConflictError);

    expect(calls).toBe(3);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });
});