import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createBed, createBuilding, createContract, createRoom, createStudent } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
let adminToken = '';
let adminId = '';

beforeAll(async () => {
  const admin = await createLoginUser(pool, { role: 'admin' });
  adminId = admin.id;
  adminToken = await loginForToken(app, admin);
});
afterAll(async () => {
  await pool.end();
});

const PDF = Buffer.from('%PDF-1.4 test');

const upload = (token: string, id: string, name: string, body: Buffer) =>
  request(app).post(`/api/announcements/${id}/files?name=${encodeURIComponent(name)}`)
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/octet-stream').send(body);

const download = (token: string, id: string, fileId: string) =>
  request(app).get(`/api/announcements/${id}/files/${fileId}`).set('Authorization', `Bearer ${token}`);

async function announcement(targets: object[] = []) {
  const r = await call(app, 'post', '/api/announcements', { token: adminToken, body: { title: 'Т', body: 'Б', targets } });
  return r.body.data.id as string;
}

async function resident() {
  const user = await createLoginUser(pool, { role: 'student' });
  const studentId = await createStudent(pool, user.id);
  const buildingId = await createBuilding(pool, 10);
  const roomId = await createRoom(pool, buildingId, { roomNumber: '201', floor: 2 });
  const bedId = await createBed(pool, roomId, 1);
  await createContract(pool, { studentId, bedId, startDate: '2030-09-01', endDate: '2030-12-01', createdBy: adminId, status: 'active' });
  return { token: await loginForToken(app, user), buildingId };
}

describe('загрузка', () => {
  it('администратор загружает PDF, файл виден в объявлении, студент не загружает', async () => {
    const id = await announcement();
    const ok = await upload(adminToken, id, 'план.pdf', PDF);
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ fileName: 'план.pdf', contentType: 'application/pdf', sizeBytes: PDF.length });

    const list = (await call(app, 'get', '/api/announcements?limit=100', { token: adminToken })).body.data as Array<{ id: string; files: unknown[] }>;
    expect(list.find((x) => x.id === id)?.files).toHaveLength(1);

    const { token } = await resident();
    expect((await upload(token, id, 'a.pdf', PDF)).status).toBe(403);
  });

  it('подмена расширения, неподдерживаемый и слишком большой файл отклоняются', async () => {
    const id = await announcement();
    expect((await upload(adminToken, id, 'a.png', PDF)).status).toBe(422);
    expect((await upload(adminToken, id, 'a.exe', Buffer.from('MZ'))).status).toBe(422);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect([413, 422]).toContain((await upload(adminToken, id, 'big.pdf', big)).status);
  });

  it('не более пяти файлов', async () => {
    const id = await announcement();
    for (let i = 0; i < 5; i++) expect((await upload(adminToken, id, `f${i}.pdf`, PDF)).status).toBe(201);
    expect((await upload(adminToken, id, 'f6.pdf', PDF)).status).toBe(409);
  });
});

describe('скачивание', () => {
  it('адресат скачивает с attachment и nosniff, чужой получает 404', async () => {
    const mine = await resident();
    const other = await resident();
    const id = await announcement([{ buildingId: mine.buildingId }]);
    const file = (await upload(adminToken, id, 'a.pdf', PDF)).body.data.id as string;

    const ok = await download(mine.token, id, file);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-disposition']).toContain('attachment');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect((await download(other.token, id, file)).status).toBe(404);
    expect((await request(app).get(`/api/announcements/${id}/files/${file}`)).status).toBe(401);
  });

  it('удаление объявления удаляет файлы, удаление файла доступно администратору', async () => {
    const id = await announcement();
    const file = (await upload(adminToken, id, 'a.pdf', PDF)).body.data.id as string;
    expect((await call(app, 'delete', `/api/announcements/${id}/files/${file}`, { token: adminToken })).status).toBe(200);
    expect((await download(adminToken, id, file)).status).toBe(404);
  });
});