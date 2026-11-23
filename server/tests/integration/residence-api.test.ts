import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { createBed, createBuilding, createContract, createRoom, createStudent } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

let admin: TestUser;
afterAll(async () => {
  await pool.end();
});
beforeAll(async () => {
  admin = await createLoginUser(pool, { role: 'admin' });
});

describe('GET /api/me/residence', () => {
  it('без токена 401', async () => {
    expect((await call(app, 'get', '/api/me/residence')).status).toBe(401);
  });

  it('студент без договора получает data: null', async () => {
    const user = await createLoginUser(pool, { role: 'student' });
    await createStudent(pool, user.id);
    const token = await loginForToken(app, user);

    const response = await call(app, 'get', '/api/me/residence', { token });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
  });

  it('студент с действующим договором видит жильё и соседей, но не себя', async () => {
    const user = await createLoginUser(pool, { role: 'student' });
    const mine = await createStudent(pool, user.id);
    const mate = await createStudent(pool);
    const room = await createRoom(pool, await createBuilding(pool, 10), { roomNumber: '201', floor: 2, capacity: 3 });
    const bedA = await createBed(pool, room, 1);
    const bedB = await createBed(pool, room, 2);
    for (const [studentId, bedId] of [[mine, bedA], [mate, bedB]] as const) {
      await createContract(pool, {
        studentId, bedId, startDate: '2030-09-01', endDate: '2030-12-01',
        createdBy: admin.id, status: 'active',
      });
    }
    const token = await loginForToken(app, user);

    const response = await call(app, 'get', '/api/me/residence', { token });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ roomNumber: '201', floor: 2, bedNumber: 1 });
    expect(response.body.data.roommates).toHaveLength(1);
  });
});

describe('чтение комнат и коек', () => {
  it('студент получает 403', async () => {
    const token = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
    expect((await call(app, 'get', '/api/rooms', { token })).status).toBe(403);
    expect((await call(app, 'get', '/api/beds', { token })).status).toBe(403);
  });
});