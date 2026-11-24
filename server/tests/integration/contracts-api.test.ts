import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ContractsService } from '../../src/services/contracts.service.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, createBuildingViaApi, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { captureDbError } from '../setup/capture.js';
import { createStudent } from '../setup/factories.js';
import { createRoomViaApi } from '../setup/rooms-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
const service = new ContractsService(pool);

let admin: TestUser;
let adminToken = '';
let studentToken = '';

beforeAll(async () => {
  admin = await createLoginUser(pool, { role: 'admin' });
  adminToken = await loginForToken(app, admin);
  // Учётная запись студента без профиля
  studentToken = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
});

afterAll(async () => {
  await pool.end();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const D1 = '2030-09-01';
const D2 = '2030-12-01';
const D3 = '2031-03-01';

interface ContractBody {
  id: string;
  studentId: string;
  bedId: string;
  startDate: string;
  endDate: string;
  monthlyRate: number;
  status: string;
  createdBy: string;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Place {
  buildingId: string;
  roomId: string;
  bedId: string;
}

async function newBedIn(roomId: string, bedNumber: number, status?: string): Promise<string> {
  const response = await call(app, 'post', '/api/beds', {
    token: adminToken,
    body: { roomId, bedNumber, ...(status ? { status } : {}) },
  });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

/** Новое общежитие, комната и койка № 1 */
async function newPlace(
  buildingOverrides: Record<string, unknown> = {},
  roomCapacity = 3
): Promise<Place> {
  const building = await createBuildingViaApi(app, pool, adminToken, buildingOverrides);
  const room = await createRoomViaApi(app, adminToken, building.id, { capacity: roomCapacity });
  return { buildingId: building.id, roomId: room.id, bedId: await newBedIn(room.id, 1) };
}

function contractPayload(
  studentId: string,
  bedId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return { studentId, bedId, startDate: D1, endDate: D2, ...overrides };
}

const postContract = (body: object) =>
  call(app, 'post', '/api/contracts', { token: adminToken, body });

async function newContract(
  studentId: string,
  bedId: string,
  overrides: Record<string, unknown> = {}
): Promise<ContractBody> {
  const response = await postContract(contractPayload(studentId, bedId, overrides));
  expect(response.status).toBe(201);
  return response.body.data as ContractBody;
}

const contractUrl = (id: string) => `/api/contracts/${id}`;

const action = (id: string, name: string, body?: object) =>
  call(app, 'post', `${contractUrl(id)}/${name}`, { token: adminToken, body });

async function fetchContract(id: string): Promise<ContractBody> {
  const response = await call(app, 'get', contractUrl(id), { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as ContractBody;
}

/** Новый договор в заданном статусе (на новой койке, для нового студента) */
async function contractIn(
  status: 'pending' | 'active' | 'cancelled' | 'terminated'
): Promise<ContractBody> {
  const place = await newPlace();
  const contract = await newContract(await createStudent(pool), place.bedId);
  if (status === 'active' || status === 'terminated') {
    expect((await action(contract.id, 'activate')).status).toBe(200);
  }
  if (status === 'terminated') {
    expect((await action(contract.id, 'terminate')).status).toBe(200);
  }
  if (status === 'cancelled') {
    expect((await action(contract.id, 'cancel')).status).toBe(200);
  }
  return fetchContract(contract.id);
}

interface AuditRow {
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
  ip: string | null;
}

async function auditFor(entityId: string): Promise<AuditRow[]> {
  const result = await pool.query<AuditRow>(
    `SELECT actor_user_id, action, entity_type, details, host(ip_address) AS ip
     FROM audit_logs WHERE entity_id = $1 ORDER BY id`,
    [entityId]
  );
  return result.rows;
}

async function countAudits(auditAction: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) AS count FROM audit_logs WHERE action = $1',
    [auditAction]
  );
  return Number(result.rows[0].count);
}

describe('доступ и роли', () => {
  it('список договоров без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/contracts')).status).toBe(401);
  });

  it('студент не может читать общий список (403)', async () => {
    const response = await call(app, 'get', '/api/contracts', { token: studentToken });

    expect(response.status).toBe(403);
  });

  it('студент не может оформлять договор (403)', async () => {
    const place = await newPlace();

    const response = await call(app, 'post', '/api/contracts', {
      token: studentToken,
      body: contractPayload(await createStudent(pool), place.bedId),
    });

    expect(response.status).toBe(403);
    const count = await pool.query('SELECT 1 FROM contracts WHERE bed_id = $1', [place.bedId]);
    expect(count.rowCount).toBe(0);
  });

  it.each(['activate', 'cancel', 'terminate', 'expire'])(
    'студент не может выполнить действие %s (403)',
    async (name) => {
      const contract = await contractIn('pending');

      const response = await call(app, 'post', `${contractUrl(contract.id)}/${name}`, {
        token: studentToken,
      });

      expect(response.status).toBe(403);
      expect(await fetchContract(contract.id)).toEqual(contract);
    }
  );

  it('студент не может изменять договор (403)', async () => {
    const contract = await contractIn('pending');

    const response = await call(app, 'patch', contractUrl(contract.id), {
      token: studentToken,
      body: { monthlyRate: 1 },
    });

    expect(response.status).toBe(403);
    expect(await fetchContract(contract.id)).toEqual(contract);
  });

  it('/my без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/contracts/my')).status).toBe(401);
  });

  it('/my для учётной записи без профиля даёт 404', async () => {
    const response = await call(app, 'get', '/api/contracts/my', { token: studentToken });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Профиль студента не найден');
  });

  it('студент читает только свои договоры: /my и по идентификатору', async () => {
    const owner = await createLoginUser(pool, { role: 'student' });
    const ownerStudentId = await createStudent(pool, owner.id);
    const ownerToken = await loginForToken(app, owner);
    const place = await newPlace();
    const first = await newContract(ownerStudentId, place.bedId);
    expect((await action(first.id, 'cancel')).status).toBe(200);
    const second = await newContract(ownerStudentId, place.bedId, {
      startDate: D2,
      endDate: D3,
    });
    const foreign = await contractIn('pending');

    const mine = await call(app, 'get', '/api/contracts/my', { token: ownerToken });
    const own = await call(app, 'get', contractUrl(second.id), { token: ownerToken });
    const other = await call(app, 'get', contractUrl(foreign.id), { token: ownerToken });

    expect(mine.status).toBe(200);
    expect((mine.body.data as ContractBody[]).map((c) => c.id)).toEqual([second.id, first.id]);
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(second.id);
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Договор не найден');
  });
});

describe('оформление договоров (POST)', () => {
  it('возвращает договор в формате camelCase; статус pending, ставка берётся из общежития', async () => {
    const place = await newPlace({ monthlyRate: 900.5 });
    const studentId = await createStudent(pool);

    const response = await postContract(contractPayload(studentId, place.bedId));

    expect(response.status).toBe(201);
    const contract = response.body.data as ContractBody;
    expect(Object.keys(contract).sort()).toEqual([
      'bedId',
      'createdAt',
      'createdBy',
      'endDate',
      'id',
      'monthlyRate',
      'startDate',
      'status',
      'studentId',
      'terminatedAt',
      'terminationReason',
      'updatedAt',
    ]);
    expect(contract).toMatchObject({
      studentId,
      bedId: place.bedId,
      startDate: D1,
      endDate: D2,
      monthlyRate: 900.5,
      status: 'pending',
      createdBy: admin.id,
      terminatedAt: null,
      terminationReason: null,
    });
  });

  it('явная ставка заменяет ставку общежития', async () => {
    const place = await newPlace({ monthlyRate: 900 });

    const contract = await newContract(await createStudent(pool), place.bedId, {
      monthlyRate: 650,
    });

    expect(contract.monthlyRate).toBe(650);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['дата окончания равна дате начала', { endDate: D1 }, 'endDate'],
    ['дата окончания раньше начала', { endDate: '2030-08-01' }, 'endDate'],
    ['несуществующая дата', { startDate: '2030-02-30' }, 'startDate'],
    ['отрицательная ставка', { monthlyRate: -1 }, 'monthlyRate'],
    ['лишнее поле', { status: 'active' }, 'status'],
  ])('оформление отклоняет: %s (400)', async (_name, overrides, field) => {
    const place = await newPlace();

    const response = await postContract(
      contractPayload(await createStudent(pool), place.bedId, overrides)
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
    expect(response.body.message).toContain(field);
  });

  it('несуществующая койка даёт 422', async () => {
    const response = await postContract(
      contractPayload(await createStudent(pool), randomUUID())
    );

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ status: 'error', message: 'Койка не найдена' });
  });

  it('несуществующий студент даёт 422', async () => {
    const place = await newPlace();

    const response = await postContract(contractPayload(randomUUID(), place.bedId));

    expect(response.status).toBe(422);
    expect(response.body.message).toBe('Студент не найден');
  });

  it('койка на обслуживании не занимается (409)', async () => {
    const place = await newPlace();
    const maintenanceBed = await newBedIn(place.roomId, 2, 'maintenance');

    const response = await postContract(contractPayload(await createStudent(pool), maintenanceBed));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Койка на обслуживании: оформить договор нельзя');
  });

  it('пересекающийся период на той же койке даёт 409, смежный период допустим', async () => {
    const place = await newPlace();
    await newContract(await createStudent(pool), place.bedId);

    const overlapping = await postContract(
      contractPayload(await createStudent(pool), place.bedId, {
        startDate: '2030-10-01',
        endDate: '2031-01-01',
      })
    );
    const adjacent = await postContract(
      contractPayload(await createStudent(pool), place.bedId, { startDate: D2, endDate: D3 })
    );

    expect(overlapping.status).toBe(409);
    expect(overlapping.body.message).toBe('Койка уже занята на выбранный период');
    expect(adjacent.status).toBe(201);
  });

  it('второй ожидающий или действующий договор студента даёт 409', async () => {
    const place = await newPlace();
    const otherBed = await newBedIn(place.roomId, 2);
    const studentId = await createStudent(pool);
    await newContract(studentId, place.bedId);

    const response = await postContract(contractPayload(studentId, otherBed));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('У студента уже есть ожидающий или действующий договор');
  });

  it('после отмены договора студент и койка снова свободны', async () => {
    const place = await newPlace();
    const studentId = await createStudent(pool);
    const first = await newContract(studentId, place.bedId);
    expect((await action(first.id, 'cancel')).status).toBe(200);

    const second = await postContract(contractPayload(studentId, place.bedId));

    expect(second.status).toBe(201);
  });
});

describe('жизненный цикл договора', () => {
  it('activate переводит pending в active', async () => {
    const contract = await contractIn('pending');

    const response = await action(contract.id, 'activate');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: contract.id,
      status: 'active',
      terminatedAt: null,
    });
  });

  it('cancel переводит pending в cancelled и освобождает койку', async () => {
    const place = await newPlace();
    const contract = await newContract(await createStudent(pool), place.bedId);

    const response = await action(contract.id, 'cancel');
    const reuse = await postContract(contractPayload(await createStudent(pool), place.bedId));

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('cancelled');
    expect(reuse.status).toBe(201);
  });

  it('terminate сохраняет причину и время расторжения и освобождает койку', async () => {
    const place = await newPlace();
    const contract = await newContract(await createStudent(pool), place.bedId);
    await action(contract.id, 'activate');

    const response = await action(contract.id, 'terminate', { reason: 'По желанию студента' });
    const reuse = await postContract(contractPayload(await createStudent(pool), place.bedId));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'terminated',
      terminationReason: 'По желанию студента',
    });
    expect(Number.isNaN(Date.parse(response.body.data.terminatedAt as string))).toBe(false);
    expect(reuse.status).toBe(201);
  });

  it('terminate без причины допустим', async () => {
    const contract = await contractIn('active');

    const response = await action(contract.id, 'terminate');

    expect(response.status).toBe(200);
    expect(response.body.data.terminationReason).toBeNull();
  });

  it('terminate с причиной из одних пробелов даёт 400', async () => {
    const contract = await contractIn('active');

    const response = await action(contract.id, 'terminate', { reason: '   ' });

    expect(response.status).toBe(400);
    expect((await fetchContract(contract.id)).status).toBe('active');
  });

  it.each<['pending' | 'active' | 'cancelled' | 'terminated', string]>([
    ['active', 'activate'],
    ['active', 'cancel'],
    ['pending', 'terminate'],
    ['pending', 'expire'],
    ['cancelled', 'activate'],
    ['terminated', 'terminate'],
  ])('договор в статусе %s: действие %s недопустимо (409)', async (status, name) => {
    const contract = await contractIn(status);

    const response = await action(contract.id, name);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('Недопустимое действие');
    expect(await fetchContract(contract.id)).toEqual(contract);
  });

  it('expire: срок не истёк — 409, срок истёк — 200', async () => {
    const future = await contractIn('active');
    const place = await newPlace();
    const past = await newContract(await createStudent(pool), place.bedId, {
      startDate: '2020-01-01',
      endDate: '2020-06-01',
    });
    await action(past.id, 'activate');

    const notYet = await action(future.id, 'expire');
    const done = await action(past.id, 'expire');

    expect(notYet.status).toBe(409);
    expect(notYet.body.message).toBe('Срок договора ещё не истёк');
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'expired', terminatedAt: null });
  });

  it('действие над неизвестным договором даёт 404', async () => {
    const response = await action(randomUUID(), 'activate');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Договор не найден' });
  });
});

describe('изменение договора (PATCH)', () => {
  it('меняет даты и ставку, пока договор ожидает', async () => {
    const contract = await contractIn('pending');

    const response = await call(app, 'patch', contractUrl(contract.id), {
      token: adminToken,
      body: { endDate: D3, monthlyRate: 650 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      ...contract,
      endDate: D3,
      monthlyRate: 650,
      updatedAt: expect.any(String),
    });
  });

  it('договор не в статусе pending не изменяется (409)', async () => {
    const contract = await contractIn('active');

    const response = await call(app, 'patch', contractUrl(contract.id), {
      token: adminToken,
      body: { monthlyRate: 1 },
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Изменять можно только договор в статусе «ожидает»');
    expect(await fetchContract(contract.id)).toEqual(contract);
  });

  it('сдвиг на занятый период даёт 409 и ничего не меняет', async () => {
    const place = await newPlace();
    await newContract(await createStudent(pool), place.bedId);
    const second = await newContract(await createStudent(pool), place.bedId, {
      startDate: D2,
      endDate: D3,
    });

    const response = await call(app, 'patch', contractUrl(second.id), {
      token: adminToken,
      body: { startDate: '2030-11-01' },
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Койка уже занята на выбранный период');
    expect(await fetchContract(second.id)).toEqual(second);
  });

  it('дата начала не раньше даты окончания даёт 400', async () => {
    const contract = await contractIn('pending');

    const response = await call(app, 'patch', contractUrl(contract.id), {
      token: adminToken,
      body: { startDate: D3 },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Дата окончания должна быть позже даты начала');
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['пустой объект', {}, 'тело запроса'],
    ['попытка сменить студента', { studentId: randomUUID() }, 'studentId'],
    ['попытка сменить статус', { status: 'active' }, 'status'],
  ])('PATCH отклоняет: %s (400)', async (_name, body, field) => {
    const contract = await contractIn('pending');

    const response = await call(app, 'patch', contractUrl(contract.id), {
      token: adminToken,
      body,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(field);
  });

  it('PATCH неизвестного договора даёт 404', async () => {
    const response = await call(app, 'patch', contractUrl(randomUUID()), {
      token: adminToken,
      body: { monthlyRate: 1 },
    });

    expect(response.status).toBe(404);
  });
});

describe('чтение договоров (GET)', () => {
  it('список: фильтры по студенту и статусу, новые первыми', async () => {
    const place = await newPlace();
    const studentId = await createStudent(pool);
    const first = await newContract(studentId, place.bedId);
    await action(first.id, 'cancel');
    const second = await newContract(studentId, place.bedId, { startDate: D2, endDate: D3 });

    const all = await call(app, 'get', `/api/contracts?studentId=${studentId}`, {
      token: adminToken,
    });
    const pending = await call(
      app,
      'get',
      `/api/contracts?studentId=${studentId}&status=pending`,
      { token: adminToken }
    );

    expect(all.status).toBe(200);
    expect((all.body.data as ContractBody[]).map((c) => c.id)).toEqual([second.id, first.id]);
    expect(all.body.meta).toEqual({ total: 2, limit: 50, offset: 0 });
    expect((pending.body.data as ContractBody[]).map((c) => c.id)).toEqual([second.id]);
    expect(pending.body.meta.total).toBe(1);
  });

  it('фильтр по койке и постраничный вывод', async () => {
    const place = await newPlace();
    const first = await newContract(await createStudent(pool), place.bedId);
    const second = await newContract(await createStudent(pool), place.bedId, {
      startDate: D2,
      endDate: D3,
    });

    const page = await call(app, 'get', `/api/contracts?bedId=${place.bedId}&limit=1&offset=1`, {
      token: adminToken,
    });

    expect(page.body.meta).toEqual({ total: 2, limit: 1, offset: 1 });
    expect((page.body.data as ContractBody[]).map((c) => c.id)).toEqual([first.id]);
    expect(second.id).not.toBe(first.id);
  });

  it.each(['status=bogus', 'foo=1', 'limit=0'])('неверный параметр %s даёт 400', async (query) => {
    const response = await call(app, 'get', `/api/contracts?${query}`, { token: adminToken });

    expect(response.status).toBe(400);
  });

  it('неизвестный идентификатор даёт 404, некорректный — 400', async () => {
    const unknown = await call(app, 'get', contractUrl(randomUUID()), { token: adminToken });
    const invalid = await call(app, 'get', '/api/contracts/not-a-uuid', { token: adminToken });

    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(400);
  });
});

describe('койки и вместимость', () => {
  it('койку с договором нельзя перевести на обслуживание, после отмены — можно', async () => {
    const place = await newPlace();
    const contract = await newContract(await createStudent(pool), place.bedId);
    const bedUrl = `/api/beds/${place.bedId}`;

    const blocked = await call(app, 'patch', bedUrl, {
      token: adminToken,
      body: { status: 'maintenance' },
    });
    await action(contract.id, 'cancel');
    const allowed = await call(app, 'patch', bedUrl, {
      token: adminToken,
      body: { status: 'maintenance' },
    });

    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('договор');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.status).toBe('maintenance');
  });

  it('сквозной сценарий: число проживающих не превышает вместимость комнаты', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);
    const room = await createRoomViaApi(app, adminToken, building.id, { capacity: 3 });
    const beds = [
      await newBedIn(room.id, 1),
      await newBedIn(room.id, 2),
      await newBedIn(room.id, 3),
    ];
    for (const bedId of beds) {
      const contract = await newContract(await createStudent(pool), bedId);
      expect((await action(contract.id, 'activate')).status).toBe(200);
    }

    const fourthBed = await call(app, 'post', '/api/beds', {
      token: adminToken,
      body: { roomId: room.id, bedNumber: 4 },
    });
    const fourthStudent = await postContract(contractPayload(await createStudent(pool), beds[0]));

    expect(fourthBed.status).toBe(409);
    expect(fourthStudent.status).toBe(409);
    const live = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM contracts c JOIN beds b ON b.id = c.bed_id
       WHERE b.room_id = $1 AND c.status IN ('pending', 'active')`,
      [room.id]
    );
    expect(live.rows[0].count).toBe(3);
  });
});

describe('журнал аудита', () => {
  it('оформление записывает автора, адрес клиента и данные договора', async () => {
    const place = await newPlace();
    const studentId = await createStudent(pool);

    const response = await call(app, 'post', '/api/contracts', {
      token: adminToken,
      ip: '10.20.30.80',
      body: contractPayload(studentId, place.bedId),
    });

    expect(response.status).toBe(201);
    const rows = await auditFor(response.body.data.id as string);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: admin.id,
      action: 'create_contract',
      entity_type: 'contracts',
      ip: '10.20.30.80',
    });
    expect(rows[0].details.after).toEqual({
      studentId,
      bedId: place.bedId,
      status: 'pending',
      startDate: D1,
      endDate: D2,
      monthlyRate: 700,
    });
  });

  it('активация и расторжение записываются со статусами до и после и причиной', async () => {
    const place = await newPlace();
    const contract = await newContract(await createStudent(pool), place.bedId);

    await action(contract.id, 'activate');
    await call(app, 'post', `${contractUrl(contract.id)}/terminate`, {
      token: adminToken,
      ip: '10.20.30.81',
      body: { reason: 'Выезд' },
    });

    const rows = await auditFor(contract.id);
    expect(rows.map((row) => row.action)).toEqual([
      'create_contract',
      'activate_contract',
      'terminate_contract',
    ]);
    expect(rows[2].ip).toBe('10.20.30.81');
    expect(rows[2].details).toEqual({
      before: { status: 'active' },
      after: { status: 'terminated' },
      reason: 'Выезд',
    });
  });

  it('отклонённые операции (409) не записывают аудит', async () => {
    const place = await newPlace();
    await newContract(await createStudent(pool), place.bedId);
    const before = await countAudits('create_contract');

    const response = await postContract(contractPayload(await createStudent(pool), place.bedId));

    expect(response.status).toBe(409);
    expect(await countAudits('create_contract')).toBe(before);
  });

  it('ошибка аудита откатывает смену статуса', async () => {
    const contract = await contractIn('pending');

    const error = await captureDbError(service.activate(contract.id, { userId: randomUUID() }));

    expect(error.code).toBe('23503');
    expect(error.constraint).toBe('audit_logs_actor_user_id_fkey');
    expect((await fetchContract(contract.id)).status).toBe('pending');
  });
});

describe('параллельные операции', () => {
  it('два одновременных договора на одну койку с пересекающимися датами: один создаётся, другой получает 409', async () => {
    for (let round = 0; round < 3; round++) {
      const place = await newPlace();
      const first = await createStudent(pool);
      const second = await createStudent(pool);

      const responses = await Promise.all([
        postContract(contractPayload(first, place.bedId)),
        postContract(contractPayload(second, place.bedId, { startDate: '2030-10-01' })),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    }
  });

  it('оформление ждёт транзакцию, переводящую койку на обслуживание, и затем отклоняется (409)', async () => {
    const place = await newPlace();
    const studentId = await createStudent(pool);
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM beds WHERE id = $1 FOR UPDATE', [place.bedId]);
      await holder.query("UPDATE beds SET status = 'maintenance' WHERE id = $1", [place.bedId]);

      let finished = false;
      const pending = postContract(contractPayload(studentId, place.bedId)).then((response) => {
        finished = true;
        return response;
      });

      await sleep(600);
      expect(finished, 'запрос должен ждать снятия блокировки койки').toBe(false);

      await holder.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Койка на обслуживании: оформить договор нельзя');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('перевод койки на обслуживание ждёт транзакцию оформления договора и затем отклоняется (409)', async () => {
    const place = await newPlace();
    const studentId = await createStudent(pool);
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      // Так оформление договора блокирует койку, прежде чем вставить договор
      await holder.query('SELECT id FROM beds WHERE id = $1 FOR SHARE', [place.bedId]);
      await holder.query(
        `INSERT INTO contracts (student_id, bed_id, start_date, end_date, monthly_rate, created_by)
         VALUES ($1, $2, $3, $4, 700, $5)`,
        [studentId, place.bedId, D1, D2, admin.id]
      );

      let finished = false;
      const pending = call(app, 'patch', `/api/beds/${place.bedId}`, {
        token: adminToken,
        body: { status: 'maintenance' },
      }).then((response) => {
        finished = true;
        return response;
      });

      await sleep(600);
      expect(finished, 'запрос должен ждать снятия блокировки койки').toBe(false);

      await holder.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('договор');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
});