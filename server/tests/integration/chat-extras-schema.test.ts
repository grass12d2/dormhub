import { afterAll, describe, expect, it } from 'vitest';
import { createLoginUser } from '../setup/auth-helpers.js';
import { expectDbError } from '../setup/db-assert.js';
import { createBuilding } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

async function message() {
  const b = await createBuilding(pool, 10);
  const chat = (
    await pool.query<{ id: string }>("INSERT INTO chats (kind, building_id, floor) VALUES ('floor', $1, 2) RETURNING id", [b])
  ).rows[0].id;
  const user = await createLoginUser(pool);
  const m = (
    await pool.query<{ id: string }>(
      'INSERT INTO chat_messages (chat_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id',
      [chat, user.id, 'Т']
    )
  ).rows[0].id;
  return { chat, user, m };
}

const file = (m: string, type: string, data: Buffer | null, size: number, expired: boolean) =>
  pool.query(
    `INSERT INTO chat_message_files (message_id, file_name, content_type, size_bytes, data, expired_at)
     VALUES ($1, 'a', $2, $3, $4, ${expired ? 'now()' : 'NULL'})`,
    [m, type, size, data]
  );

describe('chat_message_files', () => {
  it('живой файл, истёкший файл без данных; недопустимые сочетания отклоняются', async () => {
    const { m } = await message();
    await file(m, 'application/pdf', Buffer.from([1, 2]), 2, false);
    await file(m, 'application/pdf', null, 2, true);
    await expectDbError(file(m, 'application/pdf', null, 2, false), { code: '23514', constraint: 'chat_files_data_check' });
    await expectDbError(file(m, 'application/pdf', Buffer.from([1]), 5, false), { code: '23514', constraint: 'chat_files_data_check' });
    await expectDbError(file(m, 'application/x-sh', Buffer.from([1]), 1, false), { code: '23514', constraint: 'chat_files_type_check' });
    await expectDbError(file(m, 'application/pdf', null, 10485761, true), { code: '23514', constraint: 'chat_files_size_check' });
  });
});

describe('chat_reactions, chat_blocks, ответы', () => {
  it('одна реакция на пару, неизвестный вид отклоняется', async () => {
    const { m, user } = await message();
    const react = (kind: string) =>
      pool.query('INSERT INTO chat_reactions (message_id, user_id, kind) VALUES ($1, $2, $3)', [m, user.id, kind]);
    await react('love');
    await expectDbError(react('like'), { code: '23505', constraint: 'chat_reactions_pkey' });
    const other = await createLoginUser(pool);
    await expectDbError(
      pool.query('INSERT INTO chat_reactions (message_id, user_id, kind) VALUES ($1, $2, $3)', [m, other.id, 'care']),
      { code: '23514', constraint: 'chat_reactions_kind_check' }
    );
  });

  it('блокировка: не самого себя, пара уникальна', async () => {
    const a = await createLoginUser(pool);
    const b = await createLoginUser(pool);
    const block = (x: string, y: string) => pool.query('INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [x, y]);
    await block(a.id, b.id);
    await expectDbError(block(a.id, b.id), { code: '23505', constraint: 'chat_blocks_pkey' });
    await expectDbError(block(a.id, a.id), { code: '23514', constraint: 'chat_blocks_self_check' });
    await block(b.id, a.id);
  });

  it('ответ: удаление исходного сообщения обнуляет ссылку', async () => {
    const { chat, user, m } = await message();
    const reply = (
      await pool.query<{ id: string }>(
        'INSERT INTO chat_messages (chat_id, sender_id, body, reply_to_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [chat, user.id, 'Ответ', m]
      )
    ).rows[0].id;
    await pool.query('DELETE FROM chat_messages WHERE id = $1', [m]);
    const row = await pool.query('SELECT reply_to_id FROM chat_messages WHERE id = $1', [reply]);
    expect(row.rows[0].reply_to_id).toBeNull();
  });
});