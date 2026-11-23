import { afterAll, describe, expect, it } from 'vitest';
import { createLoginUser } from '../setup/auth-helpers.js';
import { expectDbError } from '../setup/db-assert.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

describe('user_two_factor', () => {
  it('по умолчанию выключена, один набор на пользователя, каскадное удаление', async () => {
    const user = await createLoginUser(pool);
    await pool.query('INSERT INTO user_two_factor (user_id, secret_enc) VALUES ($1, $2)', [user.id, 'x']);
    const row = await pool.query('SELECT enabled, last_step FROM user_two_factor WHERE user_id = $1', [user.id]);
    expect(row.rows[0]).toMatchObject({ enabled: false, last_step: '0' });
    await expectDbError(
      pool.query('INSERT INTO user_two_factor (user_id, secret_enc) VALUES ($1, $2)', [user.id, 'y']),
      { code: '23505', constraint: 'user_two_factor_pkey' }
    );
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect((await pool.query('SELECT 1 FROM user_two_factor WHERE user_id = $1', [user.id])).rowCount).toBe(0);
  });

  it('пустой секрет отклоняется', async () => {
    const user = await createLoginUser(pool);
    await expectDbError(
      pool.query('INSERT INTO user_two_factor (user_id, secret_enc) VALUES ($1, $2)', [user.id, '']),
      { code: '23514', constraint: 'user_two_factor_secret_check' }
    );
  });
});

describe('two_factor_recovery_codes', () => {
  const HASH = 'b'.repeat(64);
  const insert = (userId: string, hash = HASH) =>
    pool.query('INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES ($1, $2)', [userId, hash]);

  it('хеш длиной 64, повтор у пользователя отклоняется, у другого допустим', async () => {
    const user = await createLoginUser(pool);
    const other = await createLoginUser(pool);
    await insert(user.id);
    await expectDbError(insert(user.id, 'abc'), { code: '23514', constraint: 'two_factor_recovery_hash_check' });
    await expectDbError(insert(user.id), { code: '23505', constraint: 'two_factor_recovery_unique' });
    await insert(other.id);
  });
});