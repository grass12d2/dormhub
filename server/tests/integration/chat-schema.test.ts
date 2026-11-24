import { afterAll, describe, expect, it } from 'vitest';
import { createLoginUser } from '../setup/auth-helpers.js';
import { expectDbError } from '../setup/db-assert.js';
import { createBuilding } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

const floorChat = (b: string, floor: number) =>
  pool.query("INSERT INTO chats (kind, building_id, floor) VALUES ('floor', $1, $2)", [b, floor]);
const blockChat = (b: string, floor: number, block: number) =>
  pool.query("INSERT INTO chats (kind, building_id, floor, block) VALUES ('block', $1, $2, $3)", [b, floor, block]);

async function pair() {
  const x = await createLoginUser(pool);
  const y = await createLoginUser(pool);
  return x.id < y.id ? [x.id, y.id] : [y.id, x.id];
}

describe('chats', () => {
  it('групповые чаты уникальны по ключу', async () => {
    const b = await createBuilding(pool, 10);
    await floorChat(b, 3);
    await expectDbError(floorChat(b, 3), { code: '23505', constraint: 'idx_chats_floor' });
    await blockChat(b, 3, 2);
    await expectDbError(blockChat(b, 3, 2), { code: '23505', constraint: 'idx_chats_block' });
    await blockChat(b, 3, 4);
  });

  it('неверная форма отклоняется: этаж ниже второго, блок без этажа, неизвестный вид', async () => {
    const b = await createBuilding(pool, 10);
    await expectDbError(floorChat(b, 1), { code: '23514', constraint: 'chats_shape_check' });
    await expectDbError(
      pool.query("INSERT INTO chats (kind, building_id) VALUES ('block', $1)", [b]),
      { code: '23514', constraint: 'chats_shape_check' }
    );
    await expectDbError(pool.query("INSERT INTO chats (kind) VALUES ('room')"), {
      code: '23514',
      constraint: 'chats_kind_check',
    });
  });

  it('личный чат: упорядоченная пара, одна пара — один чат', async () => {
    const [a, b] = await pair();
    const insert = (x: string, y: string) =>
      pool.query("INSERT INTO chats (kind, user_a, user_b) VALUES ('direct', $1, $2)", [x, y]);
    await insert(a, b);
    await expectDbError(insert(a, b), { code: '23505', constraint: 'idx_chats_direct' });
    await expectDbError(insert(b, a), { code: '23514', constraint: 'chats_shape_check' });
    await expectDbError(insert(a, a), { code: '23514', constraint: 'chats_shape_check' });
  });
});

describe('chat_messages и chat_reads', () => {
  async function newChat() {
    const b = await createBuilding(pool, 10);
    const r = await pool.query<{ id: string }>(
      "INSERT INTO chats (kind, building_id, floor) VALUES ('floor', $1, 2) RETURNING id",
      [b]
    );
    return r.rows[0].id;
  }

  it('пустое и слишком длинное сообщение отклоняются', async () => {
    const chat = await newChat();
    const user = await createLoginUser(pool);
    const send = (body: string) =>
      pool.query('INSERT INTO chat_messages (chat_id, sender_id, body) VALUES ($1, $2, $3)', [chat, user.id, body]);
    await send('Привет');
    await expectDbError(send('   '), { code: '23514', constraint: 'chat_messages_body_check' });
    await expectDbError(send('а'.repeat(2001)), { code: '23514', constraint: 'chat_messages_body_check' });
    await send('а'.repeat(2000));
  });

  it('удаление чата удаляет сообщения и отметки, удаление автора оставляет сообщение', async () => {
    const chat = await newChat();
    const user = await createLoginUser(pool);
    await pool.query('INSERT INTO chat_messages (chat_id, sender_id, body) VALUES ($1, $2, $3)', [chat, user.id, 'Т']);
    await pool.query('INSERT INTO chat_reads (chat_id, user_id) VALUES ($1, $2)', [chat, user.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const kept = await pool.query('SELECT sender_id FROM chat_messages WHERE chat_id = $1', [chat]);
    expect(kept.rows[0].sender_id).toBeNull();
    await pool.query('DELETE FROM chats WHERE id = $1', [chat]);
    expect((await pool.query('SELECT 1 FROM chat_messages WHERE chat_id = $1', [chat])).rowCount).toBe(0);
  });
});