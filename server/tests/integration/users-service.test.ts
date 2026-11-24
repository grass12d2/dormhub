import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createUser } from '../../src/services/users.service.js';
import { BadRequestError, ConflictError } from '../../src/utils/errors.js';
import { captureDbError } from '../setup/capture.js';
import { createUser as createActor } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const PASSWORD = 'Correct-Horse-42';

afterAll(async () => {
  await pool.end();
});

async function countUsers(email: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) AS count FROM users WHERE email = $1',
    [email]
  );
  return Number(result.rows[0].count);
}

async function countCreateAudits(email: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT count(*) AS count FROM audit_logs WHERE action = 'create_user' AND details->>'email' = $1",
    [email]
  );
  return Number(result.rows[0].count);
}

describe('сообщежитие учётной записи', () => {
  it('пароль хранится только в виде хеша bcrypt', async () => {
    const email = `new-${randomUUID()}@example.com`;

    const user = await createUser(
      pool,
      { email, password: PASSWORD, role: 'student' },
      { bcryptRounds: 4 }
    );

    expect(user).toEqual({ id: expect.any(String), email, role: 'student' });
    const row = await pool.query<{ password_hash: string; is_active: boolean }>(
      'SELECT password_hash, is_active FROM users WHERE id = $1',
      [user.id]
    );
    expect(row.rows[0].password_hash).toMatch(/^\$2[aby]\$04\$/);
    expect(row.rows[0].password_hash).not.toContain(PASSWORD);
    expect(row.rows[0].is_active).toBe(true);
  });

  it('email приводится к нижнему регистру', async () => {
    const id = randomUUID();

    const user = await createUser(
      pool,
      { email: `New-${id}@Example.COM`, password: PASSWORD, role: 'admin' },
      { bcryptRounds: 4 }
    );

    expect(user.email).toBe(`new-${id}@example.com`);
  });

  it('запись аудита делается в той же транзакции и не содержит пароль', async () => {
    const actorId = await createActor(pool, 'admin');
    const email = `audited-${randomUUID()}@example.com`;

    const user = await createUser(
      pool,
      { email, password: PASSWORD, role: 'student' },
      { actorUserId: actorId, bcryptRounds: 4 }
    );

    const logs = await pool.query<{
      actor_user_id: string | null;
      action: string;
      entity_type: string;
      details: Record<string, unknown>;
    }>('SELECT actor_user_id, action, entity_type, details FROM audit_logs WHERE entity_id = $1', [
      user.id,
    ]);
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0].actor_user_id).toBe(actorId);
    expect(logs.rows[0].action).toBe('create_user');
    expect(logs.rows[0].entity_type).toBe('users');
    expect(logs.rows[0].details).toEqual({ email, role: 'student' });
    expect(JSON.stringify(logs.rows[0].details)).not.toContain(PASSWORD);
  });

  it('без автора запись аудита создаётся с пустым actor_user_id', async () => {
    const user = await createUser(
      pool,
      { email: `no-actor-${randomUUID()}@example.com`, password: PASSWORD, role: 'admin' },
      { bcryptRounds: 4 }
    );

    const logs = await pool.query<{ actor_user_id: string | null }>(
      'SELECT actor_user_id FROM audit_logs WHERE entity_id = $1',
      [user.id]
    );
    expect(logs.rows).toEqual([{ actor_user_id: null }]);
  });

  it('повторный email даёт ConflictError и не оставляет лишней записи аудита', async () => {
    const email = `dup-${randomUUID()}@example.com`;
    await createUser(pool, { email, password: PASSWORD, role: 'admin' }, { bcryptRounds: 4 });

    const attempt = createUser(
      pool,
      { email, password: PASSWORD, role: 'admin' },
      { bcryptRounds: 4 }
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    expect(await countUsers(email)).toBe(1);
    expect(await countCreateAudits(email)).toBe(1);
  });

  it('email, отличающийся только регистром, считается дубликатом', async () => {
    const id = randomUUID();
    await createUser(
      pool,
      { email: `case-${id}@example.com`, password: PASSWORD, role: 'admin' },
      { bcryptRounds: 4 }
    );

    const attempt = createUser(
      pool,
      { email: `CASE-${id}@EXAMPLE.COM`, password: PASSWORD, role: 'admin' },
      { bcryptRounds: 4 }
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
  });

  it('слишком короткий пароль даёт BadRequestError, пользователь не создаётся', async () => {
    const email = `weak-${randomUUID()}@example.com`;

    const attempt = createUser(
      pool,
      { email, password: '123456789', role: 'admin' },
      { bcryptRounds: 4 }
    );

    await expect(attempt).rejects.toBeInstanceOf(BadRequestError);
    expect(await countUsers(email)).toBe(0);
  });

  it('некорректный email даёт BadRequestError', async () => {
    const attempt = createUser(
      pool,
      { email: 'not-an-email', password: PASSWORD, role: 'admin' },
      { bcryptRounds: 4 }
    );

    await expect(attempt).rejects.toBeInstanceOf(BadRequestError);
  });

  it('ошибка записи аудита откатывает сообщежитие пользователя', async () => {
    const email = `rollback-${randomUUID()}@example.com`;

    // Несуществующий автор нарушает внешний ключ audit_logs.actor_user_id
    const error = await captureDbError(
      createUser(
        pool,
        { email, password: PASSWORD, role: 'admin' },
        { actorUserId: randomUUID(), bcryptRounds: 4 }
      )
    );

    expect(error.code).toBe('23503');
    expect(await countUsers(email)).toBe(0);
  });
});