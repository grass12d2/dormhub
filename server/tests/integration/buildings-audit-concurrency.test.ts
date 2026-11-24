import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { BuildingsService } from '../../src/services/buildings.service.js';
import type { CreateBuildingInput } from '../../src/validation/buildings.validation.js';
import { createTestAppOptions } from '../setup/app-options.js';
import {
  buildingPayload,
  call,
  createBuildingViaApi,
  createStaffViaApi,
  loginForToken,
  nextBuildingNumber,
} from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { captureDbError } from '../setup/capture.js';
import { createBuilding, createRoom } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
const service = new BuildingsService(pool);

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

const AUDIT_FK = 'audit_logs_actor_user_id_fkey';

describe('журнал аудита при работе через API', () => {
  it('сообщежитие общежития записывает автора, адрес клиента и новые данные', async () => {
    const number = await nextBuildingNumber(pool);

    const response = await call(app, 'post', '/api/buildings', {
      token: adminToken,
      ip: '10.20.30.40',
      body: buildingPayload(number),
    });

    expect(response.status).toBe(201);
    const rows = await auditFor(response.body.data.id as string);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: admin.id,
      action: 'create_building',
      entity_type: 'buildings',
      ip: '10.20.30.40',
    });
    expect(rows[0].details.after).toEqual({
      buildingNumber: number,
      address: 'ул. Тестовая, д. 1',
      metroStation: 'Озерки',
      buildingType: 'corridor',
      floorsCount: 10,
      monthlyRate: 700,
    });
  });

  it('изменение записывает значения до и после', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);

    const response = await call(app, 'patch', `/api/buildings/${building.id}`, {
      token: adminToken,
      ip: '10.20.30.41',
      body: { address: 'ул. Аудитная, д. 9' },
    });

    expect(response.status).toBe(200);
    const rows = await auditFor(building.id);
    expect(rows.map((row) => row.action)).toEqual(['create_building', 'update_building']);
    expect(rows[1].ip).toBe('10.20.30.41');
    expect(rows[1].details.before.address).toBe(building.address);
    expect(rows[1].details.after.address).toBe('ул. Аудитная, д. 9');
    expect(rows[1].details.after.floorsCount).toBe(rows[1].details.before.floorsCount);
  });

  it('удаление записывает снимок удалённого общежития', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);

    const response = await call(app, 'delete', `/api/buildings/${building.id}`, {
      token: adminToken,
      ip: '10.20.30.42',
    });

    expect(response.status).toBe(200);
    const rows = await auditFor(building.id);
    expect(rows.map((row) => row.action)).toEqual(['create_building', 'delete_building']);
    expect(rows[1].ip).toBe('10.20.30.42');
    expect(rows[1].details.snapshot).toEqual({
      buildingNumber: building.buildingNumber,
      address: building.address,
      metroStation: building.metroStation,
      buildingType: building.buildingType,
      floorsCount: building.floorsCount,
      monthlyRate: building.monthlyRate,
    });
  });

  it('отклонённое изменение этажей (422) не записывает аудит', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken, { floorsCount: 10 });
    await createRoom(pool, building.id, { floor: 8 });

    const response = await call(app, 'patch', `/api/buildings/${building.id}`, {
      token: adminToken,
      body: { floorsCount: 5 },
    });

    expect(response.status).toBe(422);
    expect((await auditFor(building.id)).map((row) => row.action)).toEqual(['create_building']);
  });

  it('повторный номер общежития (409) не записывает аудит', async () => {
    const first = await createBuildingViaApi(app, pool, adminToken);

    const response = await call(app, 'post', '/api/buildings', {
      token: adminToken,
      body: buildingPayload(first.buildingNumber, { address: 'ул. Дубликат, д. 1' }),
    });

    expect(response.status).toBe(409);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM audit_logs
       WHERE action = 'create_building' AND (details->'after'->>'buildingNumber')::int = $1`,
      [first.buildingNumber]
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it('операции над несуществующим общежитием (404) не записывают аудит', async () => {
    const unknownId = randomUUID();

    const patched = await call(app, 'patch', `/api/buildings/${unknownId}`, {
      token: adminToken,
      body: { address: 'Адрес' },
    });
    const deleted = await call(app, 'delete', `/api/buildings/${unknownId}`, {
      token: adminToken,
    });

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(await auditFor(unknownId)).toEqual([]);
  });

  it('добавление, изменение и удаление сотрудника записываются в аудит', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    await call(app, 'patch', `/api/buildings/${buildingId}/staff/${staff.id}`, {
      token: adminToken,
      ip: '10.20.30.43',
      body: { jobTitle: 'Дежурный' },
    });
    await call(app, 'delete', `/api/buildings/${buildingId}/staff/${staff.id}`, {
      token: adminToken,
    });

    const rows = await auditFor(staff.id);
    expect(rows.map((row) => row.action)).toEqual([
      'create_building_staff',
      'update_building_staff',
      'delete_building_staff',
    ]);
    expect(rows.every((row) => row.actor_user_id === admin.id)).toBe(true);
    expect(rows[0].details).toMatchObject({
      buildingId,
      after: { jobTitle: 'Комендант', fullName: 'Иванов Иван Иванович', phone: '+7 900 000-00-00' },
    });
    expect(rows[1].ip).toBe('10.20.30.43');
    expect(rows[1].details.before.jobTitle).toBe('Комендант');
    expect(rows[1].details.after.jobTitle).toBe('Дежурный');
    expect(rows[2].details.snapshot.jobTitle).toBe('Дежурный');
  });
});

describe('откат при ошибке записи аудита', () => {
  it('ошибка аудита при создании откатывает сообщежитие общежития', async () => {
    const number = await nextBuildingNumber(pool);
    const input: CreateBuildingInput = {
      buildingNumber: number,
      address: 'ул. Откат, д. 1',
      buildingType: 'corridor',
      floorsCount: 5,
      monthlyRate: 700,
    };

    const error = await captureDbError(service.create(input, { userId: randomUUID() }));

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    const found = await pool.query('SELECT 1 FROM buildings WHERE building_number = $1', [number]);
    expect(found.rowCount).toBe(0);
  });

  it('ошибка аудита при изменении откатывает изменение общежития', async () => {
    const buildingId = await createBuilding(pool);

    const error = await captureDbError(
      service.patch(buildingId, { address: 'Не должен сохраниться' }, { userId: randomUUID() })
    );

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    const row = await pool.query<{ address: string }>(
      'SELECT address FROM buildings WHERE id = $1',
      [buildingId]
    );
    expect(row.rows[0].address).toBe('Тестовый адрес');
  });

  it('ошибка аудита при удалении откатывает удаление и не принимается за зависимость общежития', async () => {
    const buildingId = await createBuilding(pool);

    const error = await captureDbError(service.delete(buildingId, { userId: randomUUID() }));

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    expect(error.message).not.toContain('Нельзя удалить общежитие');
    const row = await pool.query('SELECT 1 FROM buildings WHERE id = $1', [buildingId]);
    expect(row.rowCount).toBe(1);
  });

  it('ошибка аудита при добавлении сотрудника откатывает добавление и не принимается за отсутствие общежития', async () => {
    const buildingId = await createBuilding(pool);

    const error = await captureDbError(
      service.createStaff(
        buildingId,
        { jobTitle: 'Комендант', fullName: 'Тестовый Сотрудник' },
        { userId: randomUUID() }
      )
    );

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(AUDIT_FK);
    expect(error.message).not.toContain('Общежитие не найдено');
    const staff = await pool.query('SELECT 1 FROM building_staff WHERE building_id = $1', [
      buildingId,
    ]);
    expect(staff.rowCount).toBe(0);
  });
});

describe('параллельные операции', () => {
  it('два одновременных запроса с одним номером общежития: один создаёт, другой получает 409', async () => {
    for (let round = 0; round < 3; round++) {
      const number = await nextBuildingNumber(pool);
      const send = (suffix: string) =>
        call(app, 'post', '/api/buildings', {
          token: adminToken,
          body: buildingPayload(number, { address: `ул. Гонка ${suffix}` }),
        });

      const responses = await Promise.all([send('A'), send('B')]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    }
  });

  it('уменьшение числа этажей ждёт транзакцию, добавляющую комнату, и затем отклоняется (422)', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken, { floorsCount: 10 });
    const url = `/api/buildings/${building.id}`;
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      // Так добавление комнаты блокирует общежитие: FOR SHARE несовместима с FOR UPDATE
      await holder.query('SELECT id FROM buildings WHERE id = $1 FOR SHARE', [building.id]);
      await holder.query(
        'INSERT INTO rooms (building_id, room_number, floor, capacity) VALUES ($1, $2, 8, 2)',
        [building.id, '801']
      );

      let finished = false;
      const pending = call(app, 'patch', url, {
        token: adminToken,
        body: { floorsCount: 5 },
      }).then((response) => {
        finished = true;
        return response;
      });

      await sleep(600);
      expect(finished, 'запрос должен ждать снятия блокировки общежития').toBe(false);

      await holder.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(422);
      const after = await call(app, 'get', url, { token: adminToken });
      expect(after.body.data.floorsCount).toBe(10);
    } finally {
      // После COMMIT повторный ROLLBACK безвреден (только предупреждение сервера)
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('параллельные изменения разных полей не затирают друг друга', async () => {
    for (let round = 0; round < 5; round++) {
      const building = await createBuildingViaApi(app, pool, adminToken);
      const url = `/api/buildings/${building.id}`;

      const [first, second] = await Promise.all([
        call(app, 'patch', url, {
          token: adminToken,
          body: { address: `ул. Параллельная ${round}` },
        }),
        call(app, 'patch', url, { token: adminToken, body: { monthlyRate: 1000 + round } }),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const final = await call(app, 'get', url, { token: adminToken });
      expect(final.body.data).toMatchObject({
        address: `ул. Параллельная ${round}`,
        monthlyRate: 1000 + round,
      });
    }
  });
});