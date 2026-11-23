import { afterAll, describe, expect, it } from 'vitest';
import { createLoginUser } from '../setup/auth-helpers.js';
import { expectDbError } from '../setup/db-assert.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

const HASH = 'a'.repeat(64);

const insert = (userId: string, hash = HASH, attempts = 0, used = false) =>
  pool.query(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts, used_at)
     VALUES ($1, $2, now() + interval '10 minutes', $3, ${used ? 'now()' : 'NULL'})`,
    [userId, hash, attempts]
  );

describe('password_reset_codes', () => {
  it('принимает код и допускает ровно пять попыток', async () => {
    const user = await createLoginUser(pool);
    await insert(user.id, HASH, 5);
  });

  it('отклоняет хеш неверной длины и шестую попытку', async () => {
    const user = await createLoginUser(pool);
    await expectDbError(insert(user.id, 'abc'), {
      code: '23514',
      constraint: 'password_reset_codes_hash_check',
    });
    await expectDbError(insert(user.id, HASH, 6), {
      code: '23514',
      constraint: 'password_reset_codes_attempts_check',
    });
  });

  it('действующий код у пользователя один, использованных может быть много', async () => {
    const user = await createLoginUser(pool);
    await insert(user.id);
    await expectDbError(insert(user.id), {
      code: '23505',
      constraint: 'idx_password_reset_one_active',
    });
    await insert(user.id, HASH, 0, true);
    await insert(user.id, HASH, 0, true);
  });

  it('удаление пользователя удаляет его коды', async () => {
    const user = await createLoginUser(pool);
    await insert(user.id);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const result = await pool.query('SELECT 1 FROM password_reset_codes WHERE user_id = $1', [
      user.id,
    ]);
    expect(result.rowCount).toBe(0);
  });
});