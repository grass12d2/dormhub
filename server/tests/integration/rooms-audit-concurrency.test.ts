import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { RoomsService } from '../../src/services/rooms.service.js';
import type { CreateRoomInput } from '../../src/validation/rooms.validation.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, createBuildingViaApi, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { captureDbError } from '../setup/capture.js';
import { createBed, createBuilding, createRoom } from '../setup/factories.js';
import { createRoomViaApi, roomPayload } from '../setup/rooms-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
const service = new RoomsService(pool);

let admin: TestUser;
let adminToken = '';

beforeAll(async () => {
  admin = await createLoginUser(pool, { role: 'admin' });
  adminToken = await loginForToken(app, admin);
});

afterAll(async () => {
  await pool.end();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface AuditRow {
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
  ip: string | null;
}

/** Записи журнала аудита по идентификатору сущности в порядке добавления */
async function auditFor(entityId: string): Promise<AuditRow[]> {
  const result = await pool.query<AuditRow>(
    `SELECT actor_user_id, action, entity_type, details, host(ip_address) AS ip
     FROM audit_logs WHERE entity_id = $1 ORDER BY id`,
    [entityId]
  );
  return result.rows;
}

async function countRooms(buildingId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) AS count FROM rooms WHERE building_id = $1',
    [buildingId]
  );
  return Number(result.rows[0].count);
}

const AUDIT_FK = 'audit_logs_actor_user_id_fkey';

describe('журнал аудита при работе через API', () => {
  it('создание комнаты записывает автора, адрес клиента и новые данные', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      ip: '10.20.30.50',
      body: roomPayload(building.id),
    });

    expect(response.status).toBe(201);
    const rows = await auditFor(response.body.data.id as string);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: admin.id,
      action: 'create_room',
      entity_type: 'rooms',
      ip: '10.20.30.50',
    });
    expect(rows[0].details.after).toEqual({
      buildingId: building.id,
      roomNumber: '201',
      floor: 2,
      capacity: 3,
    });
  });

  it('изменение записывает значения до и после', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);
    const room = await createRoomViaApi(app, adminToken, building.id);

    const response = await call(app, 'patch', `/api/rooms/${room.id}`, {
      token: adminToken,
      ip: '10.20.30.51',
      body: { capacity: 2 },
    });

    expect(response.status).toBe(200);
    const rows = await auditFor(room.id);
    expect(rows.map((row) => row.action)).toEqual(['create_room', 'update_room']);
    expect(rows[1].ip).toBe('10.20.30.51');
    expect(rows[1].details.before.capacity).toBe(3);
    expect(rows[1].details.after.capacity).toBe(2);
    expect(rows[1].details.after.roomNumber).toBe(rows[1].details.before.roomNumber);
  });

  it('удаление записывает снимок удалённой комнаты', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);
    const room = await createRoomViaApi(app, adminToken, building.id);

    const response = await call(app, 'delete', `/api/rooms/${room.id}`, {
      token: adminToken,
      ip: '10.20.30.52',
    });

    expect(response.status).toBe(200);
    const rows = await auditFor(room.id);
    expect(rows.map((row) => row.action)).toEqual(['create_room', 'delete_room']);
    expect(rows[1].ip).toBe('10.20.30.52');
    expect(rows[1].details.snapshot).toEqual({
      buildingId: building.id,
      roomNumber: '201',
      floor: 2,
      capacity: 3,
    });
  });

  it('отклонённое создание (422) не записывает аудит', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken, { floorsCount: 10 });

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id, { roomNumber: '1101', floor: 11 }),
    });

    expect(response.status).toBe(422);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM audit_logs
       WHERE action = 'create_room' AND details->'after'->>'buildingId' = $1`,
      [building.id]
    );
    expect(Number(count.rows[0].count)).toBe(0);
  });

  it('повторный номер комнаты (409) не записывает аудит', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);
    await createRoomViaApi(app, adminToken, building.id);

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id),
    });

    expect(response.status).toBe(409);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM audit_logs
       WHERE action = 'create_room' AND details->'after'->>'buildingId' = $1`,
      [building.id]
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it('отклонённое уменьшение вместимости (409) не записывает аудит', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);
    const room = await createRoomViaApi(app, adminToken, building.id, { capacity: 3 });
    for (const number of [1, 2, 3]) {
      await createBed(pool, room.id, number);
    }

    const response = await call(app, 'patch', `/api/rooms/${room.id}`, {
      token: adminToken,
      body: { capacity: 2 },
    });

    expect(response.status).toBe(409);
    expect((await auditFor(room.id)).map((row) => row.action)).toEqual(['create_room']);
  });

  it('операции над несуществующей комнатой (404) не записывают аудит', async () => {
    const unknownId = randomUUID();

    const patched = await call(app, 'patch', `/api/rooms/${unknownId}`, {
      token: adminToken,
      body: { capacity: 2 },
    });
    const deleted = await call(app, 'delete', `/api/rooms/${unknownId}`, { token: adminToken });

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(await auditFor(unknownId)).toEqual([]);
  });
});

describe('откат при ошибке записи аудита', () => {
  it('ошибка аудита при создании откатывает создание комнаты', async () => {
    const buildingId = await createBuilding(pool, 10);
    const input: CreateRoomInput = { buildingId, roomNumber: '201', floor: 2, capacity: 3 };

    const error = await captureDbError(service.create(input, { userId: randomUUID() }));

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    expect(await countRooms(buildingId)).toBe(0);
  });

  it('ошибка аудита при изменении откатывает изменение комнаты', async () => {
    const buildingId = await createBuilding(pool, 10);
    const roomId = await createRoom(pool, buildingId, {
      roomNumber: '201',
      floor: 2,
      capacity: 3,
    });

    const error = await captureDbError(
      service.patch(roomId, { capacity: 2 }, { userId: randomUUID() })
    );

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    const row = await pool.query<{ capacity: number }>(
      'SELECT capacity FROM rooms WHERE id = $1',
      [roomId]
    );
    expect(row.rows[0].capacity).toBe(3);
  });

  it('ошибка аудита при удалении откатывает удаление и не принимается за койки', async () => {
    const buildingId = await createBuilding(pool, 10);
    const roomId = await createRoom(pool, buildingId, { roomNumber: '201', floor: 2 });

    const error = await captureDbError(service.delete(roomId, { userId: randomUUID() }));

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    expect(error.message).not.toContain('Нельзя удалить комнату');
    const row = await pool.query('SELECT 1 FROM rooms WHERE id = $1', [roomId]);
    expect(row.rowCount).toBe(1);
  });
});

describe('параллельные операции', () => {
  it('два одновременных запроса с одним номером комнаты: один создаёт, другой получает 409', async () => {
    for (let round = 0; round < 3; round++) {
      const building = await createBuildingViaApi(app, pool, adminToken);
      const send = () =>
        call(app, 'post', '/api/rooms', { token: adminToken, body: roomPayload(building.id) });

      const responses = await Promise.all([send(), send()]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await countRooms(building.id)).toBe(1);
    }
  });

  it('создание комнаты ждёт транзакцию, меняющую здание, и затем проверяет новое число этажей (422)', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken, { floorsCount: 10 });
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM buildings WHERE id = $1 FOR UPDATE', [building.id]);
      await holder.query('UPDATE buildings SET floors_count = 3 WHERE id = $1', [building.id]);

      let finished = false;
      const pending = call(app, 'post', '/api/rooms', {
        token: adminToken,
        body: roomPayload(building.id, { roomNumber: '501', floor: 5 }),
      }).then((response) => {
        finished = true;
        return response;
      });

      await sleep(600);
      expect(finished, 'запрос должен ждать снятия блокировки здания').toBe(false);

      await holder.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(422);
      expect(response.body.message).toContain('превышает число этажей здания (3)');
      expect(await countRooms(building.id)).toBe(0);
    } finally {
      // После COMMIT повторный ROLLBACK безвреден (только предупреждение сервера)
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('уменьшение вместимости ждёт транзакцию, добавляющую койки, и затем отклоняется (409)', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);
    const room = await createRoomViaApi(app, adminToken, building.id, { capacity: 3 });
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      // Так модуль коек будет блокировать комнату перед добавлением коек
      await holder.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [room.id]);
      await holder.query(
        'INSERT INTO beds (room_id, bed_number) VALUES ($1, 1), ($1, 2), ($1, 3)',
        [room.id]
      );

      let finished = false;
      const pending = call(app, 'patch', `/api/rooms/${room.id}`, {
        token: adminToken,
        body: { capacity: 2 },
      }).then((response) => {
        finished = true;
        return response;
      });

      await sleep(600);
      expect(finished, 'запрос должен ждать снятия блокировки комнаты').toBe(false);

      await holder.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('уже 3 коек');
      const after = await call(app, 'get', `/api/rooms/${room.id}`, { token: adminToken });
      expect(after.body.data.capacity).toBe(3);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('параллельные изменения разных полей не затирают друг друга', async () => {
    for (let round = 0; round < 5; round++) {
      const building = await createBuildingViaApi(app, pool, adminToken);
      const room = await createRoomViaApi(app, adminToken, building.id, { capacity: 4 });
      const url = `/api/rooms/${room.id}`;

      const [first, second] = await Promise.all([
        call(app, 'patch', url, { token: adminToken, body: { capacity: 3 } }),
        call(app, 'patch', url, { token: adminToken, body: { roomNumber: '202' } }),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const final = await call(app, 'get', url, { token: adminToken });
      expect(final.body.data).toMatchObject({ capacity: 3, roomNumber: '202' });
    }
  });
});