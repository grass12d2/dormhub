import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { withRetry, withTransaction } from '../../src/db/transaction.js';
import { captureDbError } from '../setup/capture.js';
import { createBuilding, createRoom } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

const INSERT_BUILDING = `
  INSERT INTO buildings (building_number, address, building_type, floors_count)
  VALUES ((SELECT COALESCE(max(building_number), 0) + 1 FROM buildings), $1, 'corridor', 3)`;

const COUNT_BY_ADDRESS = 'SELECT count(*) AS count FROM buildings WHERE address = $1';

async function countBuildings(address: string): Promise<number> {
  const result = await pool.query<{ count: string }>(COUNT_BY_ADDRESS, [address]);
  return Number(result.rows[0].count);
}

describe('withTransaction на реальной базе', () => {
  it('COMMIT сохраняет изменения', async () => {
    const address = `commit-${randomUUID()}`;
    await withTransaction(pool, (client) => client.query(INSERT_BUILDING, [address]));
    expect(await countBuildings(address)).toBe(1);
  });

  it('при ошибке изменения откатываются, исходная ошибка сохраняется', async () => {
    const address = `rollback-${randomUUID()}`;
    await expect(
      withTransaction(pool, async (client) => {
        await client.query(INSERT_BUILDING, [address]);
        throw new Error('Сбой после вставки');
      })
    ).rejects.toThrow('Сбой после вставки');
    expect(await countBuildings(address)).toBe(0);
  });

  it('ошибка записи аудита откатывает и бизнес-операцию', async () => {
    const address = `audit-fail-${randomUUID()}`;
    const error = await captureDbError(
      withTransaction(pool, async (client) => {
        await client.query(INSERT_BUILDING, [address]);
        // Пустое действие нарушает проверку audit_logs_action_check
        await client.query("INSERT INTO audit_logs (action) VALUES ('   ')");
      })
    );
    expect(error.code).toBe('23514');
    expect(await countBuildings(address)).toBe(0);
  });

  it('изменения невидимы за пределами транзакции до COMMIT', async () => {
    const address = `visibility-${randomUUID()}`;
    let inside = -1;
    let outside = -1;

    await withTransaction(pool, async (client) => {
      await client.query(INSERT_BUILDING, [address]);
      const own = await client.query<{ count: string }>(COUNT_BY_ADDRESS, [address]);
      inside = Number(own.rows[0].count);
      // Другое соединение из пула не видит незафиксированную запись
      outside = await countBuildings(address);
    });

    expect(inside).toBe(1);
    expect(outside).toBe(0);
    expect(await countBuildings(address)).toBe(1);
  });

  it('все запросы операции идут через одно и то же соединение', async () => {
    await withTransaction(pool, async (client) => {
      const first = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const second = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      expect(second.rows[0].pid).toBe(first.rows[0].pid);
    });
  });

  it('lock_timeout равен 5 с внутри транзакции и сбрасывается после неё', async () => {
    let inside = '';
    await withTransaction(pool, async (client) => {
      const result = await client.query<{ lock_timeout: string }>('SHOW lock_timeout');
      inside = result.rows[0].lock_timeout;
    });
    const after = await pool.query<{ lock_timeout: string }>('SHOW lock_timeout');

    expect(inside).toBe('5s');
    expect(after.rows[0].lock_timeout).toBe('0');
  });

  it('ожидание блокировки прерывается примерно через 5 секунд (SQLSTATE 55P03)', async () => {
    const roomId = await createRoom(pool, await createBuilding(pool));
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);

      const startedAt = Date.now();
      const error = await captureDbError(
        withTransaction(pool, (client) =>
          client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId])
        )
      );
      const elapsed = Date.now() - startedAt;

      expect(error.code).toBe('55P03');
      expect(elapsed).toBeGreaterThanOrEqual(4500);
      expect(elapsed).toBeLessThan(9000);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    // Пул остаётся рабочим после прерванной транзакции
    const check = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    expect(check.rows[0].ok).toBe(1);
  });

  it('клиенты возвращаются в пул после успешных и неудачных транзакций', async () => {
    await withTransaction(pool, async (client) => client.query('SELECT 1'));
    await expect(
      withTransaction(pool, async () => {
        throw new Error('Сбой');
      })
    ).rejects.toThrow('Сбой');

    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  });
});

describe('withRetry на реальной базе', () => {
  it('взаимная блокировка (40P01) разрешается повтором, обе операции завершаются', async () => {
    const buildingId = await createBuilding(pool);
    const roomA = await createRoom(pool, buildingId);
    const roomB = await createRoom(pool, buildingId);

    const attempts = { a: 0, b: 0 };
    let arrived = 0;
    let openBarrier: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      openBarrier = resolve;
    });

    // Первая попытка каждой операции ждёт, пока обе возьмут по первой комнате:
    // так гарантированно возникает взаимная блокировка в разном порядке.
    const worker = (first: string, second: string, key: 'a' | 'b') =>
      withRetry(pool, async (client) => {
        attempts[key] += 1;
        await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [first]);
        if (attempts[key] === 1) {
          arrived += 1;
          if (arrived === 2) {
            openBarrier();
          }
          await barrier;
        }
        await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [second]);
        return key;
      });

    const results = await Promise.all([worker(roomA, roomB, 'a'), worker(roomB, roomA, 'b')]);

    expect([...results].sort()).toEqual(['a', 'b']);
    // Одна из операций была прервана базой и выполнена повторно
    expect(attempts.a + attempts.b).toBeGreaterThanOrEqual(3);
  });
});