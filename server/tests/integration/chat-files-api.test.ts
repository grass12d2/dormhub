import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ChatFilesService } from '../../src/services/chat-files.service.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { createBed, createBuilding, createContract, createRoom, createStudent } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
let admin: TestUser;

beforeAll(async () => {
  admin = await createLoginUser(pool, { role: 'admin' });
});
afterAll(async () => {
  await pool.end();
});

const PDF = Buffer.from('%PDF-1.4 test');

async function resident(buildingId: string, roomNumber: string) {
  const user = await createLoginUser(pool, { role: 'student' });
  const studentId = await createStudent(pool, user.id);
  const roomId = await createRoom(pool, buildingId, { roomNumber, floor: 2 });
  const bedId = await createBed(pool, roomId, 1);
  await createContract(pool, { studentId, bedId, startDate: '2030-09-01', endDate: '2030-12-01', createdBy: admin.id, status: 'active' });
  return { token: await loginForToken(app, user) };
}

const upload = (token: string, chat: number, msg: number, name: string, body: Buffer) =>
  request(app).post(`/api/chats/${chat}/messages/${msg}/files?name=${encodeURIComponent(name)}`)
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/octet-stream').send(body);
const download = (token: string, chat: number, msg: number, file: string) =>
  request(app).get(`/api/chats/${chat}/messages/${msg}/files/${file}`).set('Authorization', `Bearer ${token}`);

async function setup() {
  const b = await createBuilding(pool, 10);
  const x = await resident(b, '201');
  const y = await resident(b, '202');
  const out = await resident(await createBuilding(pool, 10), '201');
  const chats = (await call(app, 'get', '/api/chats', { token: x.token })).body.data as Array<{ id: number; kind: string }>;
  const chat = chats.find((c) => c.kind === 'floor')!.id;
  await call(app, 'get', '/api/chats', { token: y.token });
  const msg = (await call(app, 'post', `/api/chats/${chat}/messages`, { token: x.token, body: { body: 'Файл' } })).body.data.id as number;
  return { x, y, out, chat, msg };
}

describe('вложения чата', () => {
  it('автор прикрепляет, участник скачивает, чужой и посторонний нет', async () => {
    const { x, y, out, chat, msg } = await setup();
    const ok = await upload(x.token, chat, msg, 'план.pdf', PDF);
    expect(ok.status).toBe(201);
    const fileId = ok.body.data.id as string;

    expect((await upload(y.token, chat, msg, 'a.pdf', PDF)).status).toBe(403);
    const got = await download(y.token, chat, msg, fileId);
    expect(got.status).toBe(200);
    expect(got.headers['content-disposition']).toContain('attachment');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect((await download(out.token, chat, msg, fileId)).status).toBe(404);

    const list = (await call(app, 'get', `/api/chats/${chat}/messages`, { token: y.token })).body.data as Array<{ files: Array<{ fileName: string; expired: boolean }> }>;
    expect(list[0].files).toEqual([expect.objectContaining({ fileName: 'план.pdf', expired: false })]);
  });

  it('проверка типа, размера и числа файлов', async () => {
    const { x, chat, msg } = await setup();
    expect((await upload(x.token, chat, msg, 'a.png', PDF)).status).toBe(422);
    expect((await upload(x.token, chat, msg, 'a.exe', Buffer.from('MZ'))).status).toBe(422);
    for (let i = 0; i < 5; i++) expect((await upload(x.token, chat, msg, `f${i}.pdf`, PDF)).status).toBe(201);
    expect((await upload(x.token, chat, msg, 'f6.pdf', PDF)).status).toBe(409);
  });

  it('через семь дней содержимое удаляется, имя остаётся, скачивание даёт 410', async () => {
    const { x, y, chat, msg } = await setup();
    const fileId = (await upload(x.token, chat, msg, 'старый.pdf', PDF)).body.data.id as string;
    await pool.query("UPDATE chat_message_files SET created_at = now() - interval '8 days' WHERE id = $1", [fileId]);

    expect((await download(y.token, chat, msg, fileId)).status).toBe(410);
    const cleaned = await new ChatFilesService(pool).expireOld();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    const row = await pool.query('SELECT data, expired_at, file_name FROM chat_message_files WHERE id = $1', [fileId]);
    expect(row.rows[0].data).toBeNull();
    expect(row.rows[0].expired_at).not.toBeNull();
    expect(row.rows[0].file_name).toBe('старый.pdf');

    const list = (await call(app, 'get', `/api/chats/${chat}/messages`, { token: y.token })).body.data as Array<{ files: Array<{ fileName: string; expired: boolean }> }>;
    expect(list[0].files).toEqual([expect.objectContaining({ fileName: 'старый.pdf', expired: true })]);
  });
});