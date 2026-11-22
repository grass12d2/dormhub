import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import {
  buildingPayload,
  call,
  createBuildingViaApi,
  loginForToken,
  nextBuildingNumber,
  type BuildingBody,
  type HttpMethod,
} from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createRoom } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

let adminToken = '';
let studentToken = '';

beforeAll(async () => {
  adminToken = await loginForToken(app, await createLoginUser(pool, { role: 'admin' }));
  studentToken = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
});

afterAll(async () => {
  await pool.end();
});

const createViaApi = (overrides: Record<string, unknown> = {}) =>
  createBuildingViaApi(app, pool, adminToken, overrides);

const buildingUrl = (id: string) => `/api/buildings/${id}`;

async function fetchBuilding(id: string): Promise<BuildingBody> {
  const response = await call(app, 'get', buildingUrl(id), { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as BuildingBody;
}

/** Здание на 10 этажей с одной комнатой на указанном этаже */
async function createWithRoomAt(floor: number): Promise<BuildingBody> {
  const building = await createViaApi({ floorsCount: 10 });
  await createRoom(pool, building.id, { floor });
  return building;
}

describe('доступ и роли', () => {
  it('список зданий без токена даёт 401', async () => {
    const response = await call(app, 'get', '/api/buildings');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ status: 'error', message: 'Требуется аутентификация' });
  });

  it('создание здания без токена даёт 401', async () => {
    const number = await nextBuildingNumber(pool);

    const response = await call(app, 'post', '/api/buildings', { body: buildingPayload(number) });

    expect(response.status).toBe(401);
  });

  it('студент читает список зданий', async () => {
    const response = await call(app, 'get', '/api/buildings', { token: studentToken });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('студент читает здание по идентификатору', async () => {
    const building = await createViaApi();

    const response = await call(app, 'get', buildingUrl(building.id), { token: studentToken });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(building.id);
  });

  it('студент не может создавать здание (403)', async () => {
    const number = await nextBuildingNumber(pool);

    const response = await call(app, 'post', '/api/buildings', {
      token: studentToken,
      body: buildingPayload(number),
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Недостаточно прав для выполнения операции');
    const found = await pool.query('SELECT 1 FROM buildings WHERE building_number = $1', [number]);
    expect(found.rowCount).toBe(0);
  });

  it.each<[string, HttpMethod, object | undefined]>([
    ['PUT', 'put', buildingPayload(1)],
    ['PATCH', 'patch', { address: 'Чужой адрес' }],
    ['DELETE', 'delete', undefined],
  ])('студент не может изменять здание: %s (403)', async (_name, method, body) => {
    const building = await createViaApi();

    const response = await call(app, method, buildingUrl(building.id), {
      token: studentToken,
      body,
    });

    expect(response.status).toBe(403);
    expect(await fetchBuilding(building.id)).toEqual(building);
  });
});

describe('создание зданий (POST)', () => {
  it('возвращает созданное здание в формате camelCase без snake_case', async () => {
    const number = await nextBuildingNumber(pool);

    const response = await call(app, 'post', '/api/buildings', {
      token: adminToken,
      body: buildingPayload(number),
    });

    expect(response.status).toBe(201);
    const data = response.body.data as BuildingBody;
    expect(data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(Object.keys(data).sort()).toEqual([
      'address',
      'buildingNumber',
      'buildingType',
      'createdAt',
      'floorsCount',
      'id',
      'metroStation',
      'monthlyRate',
      'updatedAt',
    ]);
    expect(data).toMatchObject({
      buildingNumber: number,
      address: 'ул. Тестовая, д. 1',
      metroStation: 'Озерки',
      buildingType: 'corridor',
      floorsCount: 10,
      monthlyRate: 700,
    });
    expect(Number.isNaN(Date.parse(data.createdAt))).toBe(false);
  });

  it('сохраняет плату с копейками', async () => {
    const building = await createViaApi({ monthlyRate: 700.5 });

    expect(building.monthlyRate).toBe(700.5);
    const stored = await pool.query<{ monthly_rate: string }>(
      'SELECT monthly_rate FROM buildings WHERE id = $1',
      [building.id]
    );
    expect(stored.rows[0].monthly_rate).toBe('700.50');
  });

  it('станция метро по умолчанию null', async () => {
    const number = await nextBuildingNumber(pool);
    const body: Record<string, unknown> = buildingPayload(number);
    delete body.metroStation;

    const response = await call(app, 'post', '/api/buildings', { token: adminToken, body });

    expect(response.status).toBe(201);
    expect(response.body.data.metroStation).toBeNull();
  });

  it('обрезает пробелы по краям адреса', async () => {
    const building = await createViaApi({ address: '  ул. Пробельная, д. 2  ' });

    expect(building.address).toBe('ул. Пробельная, д. 2');
  });

  it('повторный номер здания даёт 409', async () => {
    const existing = await createViaApi();

    const response = await call(app, 'post', '/api/buildings', {
      token: adminToken,
      body: buildingPayload(existing.buildingNumber),
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Здание с таким номером уже существует',
    });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['ноль этажей', { floorsCount: 0 }, 'floorsCount'],
    ['неизвестный тип здания', { buildingType: 'tower' }, 'buildingType'],
    ['отрицательная плата', { monthlyRate: -1 }, 'monthlyRate'],
    ['плата с тремя знаками после запятой', { monthlyRate: 700.123 }, 'monthlyRate'],
    ['адрес из одних пробелов', { address: '   ' }, 'address'],
    ['номер здания 0', { buildingNumber: 0 }, 'buildingNumber'],
    ['лишнее поле', { role: 'admin' }, 'role'],
  ])('создание отклоняет: %s (400)', async (_name, overrides, field) => {
    const number = await nextBuildingNumber(pool);

    const response = await call(app, 'post', '/api/buildings', {
      token: adminToken,
      body: buildingPayload(number, overrides),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
    expect(response.body.message).toContain(field);
  });

  it('пустой объект вместо тела даёт 400', async () => {
    const response = await call(app, 'post', '/api/buildings', { token: adminToken, body: {} });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
  });
});

describe('чтение зданий (GET)', () => {
  it('список возвращает здания по возрастанию номера', async () => {
    const first = await createViaApi();
    const second = await createViaApi();

    const response = await call(app, 'get', '/api/buildings', { token: adminToken });

    expect(response.status).toBe(200);
    const buildings = response.body.data as BuildingBody[];
    const numbers = buildings.map((building) => building.buildingNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    const ids = buildings.map((building) => building.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  it('здание по идентификатору возвращает те же данные, что при создании', async () => {
    const building = await createViaApi();

    expect(await fetchBuilding(building.id)).toEqual(building);
  });

  it('неизвестный идентификатор даёт 404', async () => {
    const response = await call(app, 'get', buildingUrl(randomUUID()), { token: adminToken });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Здание не найдено' });
  });

  it('некорректный идентификатор даёт 400', async () => {
    const response = await call(app, 'get', '/api/buildings/not-a-uuid', { token: adminToken });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ status: 'error', message: 'Некорректный идентификатор' });
  });

  it('идентификатор в верхнем регистре находит здание', async () => {
    const building = await createViaApi();

    const response = await call(app, 'get', buildingUrl(building.id.toUpperCase()), {
      token: adminToken,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(building.id);
  });
});

describe('полная замена (PUT)', () => {
  it('полностью заменяет поля здания', async () => {
    const building = await createViaApi();
    const next = buildingPayload(building.buildingNumber, {
      address: 'ул. Новая, д. 5',
      metroStation: 'Нарвская',
      buildingType: 'apartment',
      floorsCount: 12,
      monthlyRate: 1200,
    });

    const response = await call(app, 'put', buildingUrl(building.id), {
      token: adminToken,
      body: next,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject(next);
    expect(response.body.data.id).toBe(building.id);
  });

  it('отсутствие metroStation в PUT очищает станцию', async () => {
    const building = await createViaApi();
    expect(building.metroStation).toBe('Озерки');
    const body: Record<string, unknown> = buildingPayload(building.buildingNumber);
    delete body.metroStation;

    const response = await call(app, 'put', buildingUrl(building.id), { token: adminToken, body });

    expect(response.status).toBe(200);
    expect(response.body.data.metroStation).toBeNull();
  });

  it('PUT без обязательного поля даёт 400 и ничего не меняет', async () => {
    const building = await createViaApi();
    const body: Record<string, unknown> = buildingPayload(building.buildingNumber, {
      address: 'Не должен сохраниться',
    });
    delete body.floorsCount;

    const response = await call(app, 'put', buildingUrl(building.id), { token: adminToken, body });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('floorsCount');
    expect(await fetchBuilding(building.id)).toEqual(building);
  });

  it('PUT неизвестного здания даёт 404', async () => {
    const number = await nextBuildingNumber(pool);

    const response = await call(app, 'put', buildingUrl(randomUUID()), {
      token: adminToken,
      body: buildingPayload(number),
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Здание не найдено');
  });

  it('PUT с номером другого здания даёт 409', async () => {
    const first = await createViaApi();
    const second = await createViaApi();

    const response = await call(app, 'put', buildingUrl(second.id), {
      token: adminToken,
      body: buildingPayload(first.buildingNumber),
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Здание с таким номером уже существует');
    expect(await fetchBuilding(second.id)).toEqual(second);
  });
});

describe('частичное изменение (PATCH)', () => {
  it('меняет только переданные поля', async () => {
    const building = await createViaApi();

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { address: 'ул. Изменённая, д. 7' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      ...building,
      address: 'ул. Изменённая, д. 7',
      updatedAt: expect.any(String),
    });
  });

  it('null очищает станцию метро', async () => {
    const building = await createViaApi();

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { metroStation: null },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.metroStation).toBeNull();
    expect(response.body.data.address).toBe(building.address);
  });

  it('пустой объект даёт 400', async () => {
    const building = await createViaApi();

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: {},
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
  });

  it('неизвестное поле даёт 400', async () => {
    const building = await createViaApi();

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { foo: 1 },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('foo');
  });

  it('PATCH неизвестного здания даёт 404', async () => {
    const response = await call(app, 'patch', buildingUrl(randomUUID()), {
      token: adminToken,
      body: { address: 'Адрес' },
    });

    expect(response.status).toBe(404);
  });

  it('PATCH с номером другого здания даёт 409', async () => {
    const first = await createViaApi();
    const second = await createViaApi();

    const response = await call(app, 'patch', buildingUrl(second.id), {
      token: adminToken,
      body: { buildingNumber: first.buildingNumber },
    });

    expect(response.status).toBe(409);
    expect(await fetchBuilding(second.id)).toEqual(second);
  });

  it('может менять несколько полей сразу', async () => {
    const building = await createViaApi();
    const newNumber = await nextBuildingNumber(pool);

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { buildingType: 'block', monthlyRate: 900, buildingNumber: newNumber },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      buildingType: 'block',
      monthlyRate: 900,
      buildingNumber: newNumber,
      address: building.address,
    });
  });
});

describe('число этажей', () => {
  it('нельзя уменьшить число этажей ниже этажа существующей комнаты (422)', async () => {
    const building = await createWithRoomAt(8);

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { floorsCount: 7 },
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('этаже 8');
    expect((await fetchBuilding(building.id)).floorsCount).toBe(10);
  });

  it('можно уменьшить число этажей до этажа существующей комнаты', async () => {
    const building = await createWithRoomAt(8);

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { floorsCount: 8 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.floorsCount).toBe(8);
  });

  it('PUT с меньшим числом этажей тоже проверяется', async () => {
    const building = await createWithRoomAt(8);

    const response = await call(app, 'put', buildingUrl(building.id), {
      token: adminToken,
      body: buildingPayload(building.buildingNumber, { floorsCount: 5 }),
    });

    expect(response.status).toBe(422);
    expect(await fetchBuilding(building.id)).toEqual(building);
  });

  it('можно уменьшить число этажей, если комнат нет', async () => {
    const building = await createViaApi({ floorsCount: 10 });

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { floorsCount: 3 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.floorsCount).toBe(3);
  });

  it('число этажей можно увеличить при наличии комнат', async () => {
    const building = await createWithRoomAt(8);

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { floorsCount: 20 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.floorsCount).toBe(20);
  });

  it('можно уменьшить число этажей, если все комнаты ниже нового предела', async () => {
    const building = await createWithRoomAt(3);

    const response = await call(app, 'patch', buildingUrl(building.id), {
      token: adminToken,
      body: { floorsCount: 5 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.floorsCount).toBe(5);
  });
});

describe('удаление зданий', () => {
  it('удаляет здание и возвращает его идентификатор', async () => {
    const building = await createViaApi();

    const response = await call(app, 'delete', buildingUrl(building.id), { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'success', data: { id: building.id } });
    const after = await call(app, 'get', buildingUrl(building.id), { token: adminToken });
    expect(after.status).toBe(404);
  });

  it('удаление неизвестного здания даёт 404', async () => {
    const response = await call(app, 'delete', buildingUrl(randomUUID()), { token: adminToken });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Здание не найдено');
  });

  it('здание с комнатами не удаляется (409), а после удаления комнаты удаляется', async () => {
    const building = await createViaApi();
    const roomId = await createRoom(pool, building.id, { floor: 2 });

    const blocked = await call(app, 'delete', buildingUrl(building.id), { token: adminToken });

    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('Нельзя удалить здание: в нём есть комнаты');
    await fetchBuilding(building.id);

    await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    const deleted = await call(app, 'delete', buildingUrl(building.id), { token: adminToken });
    expect(deleted.status).toBe(200);
  });

  it('здание с сотрудниками не удаляется (409)', async () => {
    const building = await createViaApi();
    await pool.query(
      "INSERT INTO building_staff (building_id, job_title, full_name) VALUES ($1, 'Комендант', 'Тестовый Сотрудник')",
      [building.id]
    );

    const response = await call(app, 'delete', buildingUrl(building.id), { token: adminToken });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Нельзя удалить здание: у него есть сотрудники');
    await fetchBuilding(building.id);
  });
});