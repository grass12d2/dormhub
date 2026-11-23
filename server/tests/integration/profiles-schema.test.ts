import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createLoginUser } from '../setup/auth-helpers.js';
import { expectDbError } from '../setup/db-assert.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

const insertAvatar = (userId: string, type: string, data: Buffer) =>
  pool.query('INSERT INTO user_avatars (user_id, content_type, data) VALUES ($1, $2, $3)', [
    userId,
    type,
    data,
  ]);

describe('user_profiles', () => {
  it('принимает профиль с пустыми необязательными полями', async () => {
    const user = await createLoginUser(pool);
    await pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]);
    const result = await pool.query('SELECT display_name FROM user_profiles WHERE user_id = $1', [user.id]);
    expect(result.rows[0].display_name).toBeNull();
  });

  it('один профиль на учётную запись', async () => {
    const user = await createLoginUser(pool);
    await pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]);
    await expectDbError(pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]), {
      code: '23505',
      constraint: 'user_profiles_pkey',
    });
  });

  it('несуществующий пользователь отклоняется', async () => {
    await expectDbError(pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [randomUUID()]), {
      code: '23503',
    });
  });

  it('пустое имя из пробелов отклоняется', async () => {
    const user = await createLoginUser(pool);
    await expectDbError(
      pool.query('INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)', [user.id, '   ']),
      { code: '23514', constraint: 'user_profiles_display_name_check' }
    );
  });

  it('удаление пользователя удаляет профиль', async () => {
    const user = await createLoginUser(pool);
    await pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const result = await pool.query('SELECT 1 FROM user_profiles WHERE user_id = $1', [user.id]);
    expect(result.rowCount).toBe(0);
  });
});

describe('user_avatars', () => {
  it('принимает допустимые типы', async () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      const user = await createLoginUser(pool);
      await insertAvatar(user.id, type, Buffer.from([1, 2, 3]));
    }
  });

  it('отклоняет другой тип', async () => {
    const user = await createLoginUser(pool);
    await expectDbError(insertAvatar(user.id, 'image/gif', Buffer.from([1])), {
      code: '23514',
      constraint: 'user_avatars_content_type_check',
    });
  });

  it('отклоняет пустое изображение и больше 2 МБ, граница 2 МБ допустима', async () => {
    const user = await createLoginUser(pool);
    await expectDbError(insertAvatar(user.id, 'image/png', Buffer.alloc(0)), {
      code: '23514',
      constraint: 'user_avatars_size_check',
    });
    await expectDbError(insertAvatar(user.id, 'image/png', Buffer.alloc(2097153)), {
      code: '23514',
      constraint: 'user_avatars_size_check',
    });
    await insertAvatar(user.id, 'image/png', Buffer.alloc(2097152));
    const size = await pool.query<{ n: number }>(
      'SELECT octet_length(data) AS n FROM user_avatars WHERE user_id = $1',
      [user.id]
    );
    expect(size.rows[0].n).toBe(2097152);
  });

  it('один аватар на учётную запись и каскадное удаление', async () => {
    const user = await createLoginUser(pool);
    await insertAvatar(user.id, 'image/png', Buffer.from([1]));
    await expectDbError(insertAvatar(user.id, 'image/png', Buffer.from([2])), {
      code: '23505',
      constraint: 'user_avatars_pkey',
    });
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const result = await pool.query('SELECT 1 FROM user_avatars WHERE user_id = $1', [user.id]);
    expect(result.rowCount).toBe(0);
  });
});