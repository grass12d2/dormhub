import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import {
  call,
  createBuildingViaApi,
  loginForToken,
  type HttpMethod,
} from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createBed } from '../setup/factories.js';
import { createRoomViaApi, roomPayload, type RoomBody } from '../setup/rooms-helpers.js';
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

/** Здание типа corridor на 10 этажей, если не указано иное */
const newBuilding = (overrides: Record<string, unknown> = {}) =>
  createBuildingViaApi(app, pool, adminToken, overrides);

const newRoom = (buildingId: string, overrides: Record<string, unknown> = {}) =>
  createRoomViaApi(app, adminToken, buildingId, overrides);

const roomUrl = (id: string) => `/api/rooms/${id}`;

async function fetchRoom(id: string): Promise<RoomBody> {
  const response = await call(app, 'get', roomUrl(id), { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as RoomBody;
}

async function countRooms(buildingId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) AS count FROM rooms WHERE building_id = $1',
    [buildingId]
  );
  return Number(result.rows[0].count);
}

describe('доступ и роли', () => {
  it('список комнат без токена даёт 401', async () => {
    const response = await call(app, 'get', '/api/rooms');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ status: 'error', message: 'Требуется аутентификация' });
  });

  it('создание комнаты без токена даёт 401', async () => {
    const building = await newBuilding();

    const response = await call(app, 'post', '/api/rooms', { body: roomPayload(building.id) });

    expect(response.status).toBe(401);
    expect(await countRooms(building.id)).toBe(0);
  });

  it('студент читает список комнат', async () => {
    const response = await call(app, 'get', '/api/rooms', { token: studentToken });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('студент читает комнату по идентификатору', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'get', roomUrl(room.id), { token: studentToken });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(room.id);
  });

  it('студент не может создавать комнату (403)', async () => {
    const building = await newBuilding();

    const response = await call(app, 'post', '/api/rooms', {
      token: studentToken,
      body: roomPayload(building.id),
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Недостаточно прав для выполнения операции');
    expect(await countRooms(building.id)).toBe(0);
  });

  it.each<[string, HttpMethod, (buildingId: string) => object | undefined]>([
    ['PUT', 'put', (buildingId) => roomPayload(buildingId, { capacity: 2 })],
    ['PATCH', 'patch', () => ({ capacity: 2 })],
    ['DELETE', 'delete', () => undefined],
  ])('студент не может изменять комнату: %s (403)', async (_name, method, makeBody) => {
    const building = await newBuilding();
    const room = await newRoom(building.id);

    const response = await call(app, method, roomUrl(room.id), {
      token: studentToken,
      body: makeBody(building.id),
    });

    expect(response.status).toBe(403);
    expect(await fetchRoom(room.id)).toEqual(room);
  });
});

describe('создание комнат (POST)', () => {
  it('возвращает комнату в формате camelCase без лишних полей', async () => {
    const building = await newBuilding();

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id),
    });

    expect(response.status).toBe(201);
    const room = response.body.data as RoomBody;
    expect(room.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(Object.keys(room).sort()).toEqual([
      'buildingId',
      'capacity',
      'createdAt',
      'floor',
      'id',
      'roomNumber',
      'updatedAt',
    ]);
    expect(room).toMatchObject({
      buildingId: building.id,
      roomNumber: '201',
      floor: 2,
      capacity: 3,
    });
  });

  it('обрезает пробелы по краям номера комнаты', async () => {
    const building = await newBuilding();

    const room = await newRoom(building.id, { roomNumber: ' 201 ' });

    expect(room.roomNumber).toBe('201');
  });

  it('повторный номер в том же здании даёт 409', async () => {
    const building = await newBuilding();
    await newRoom(building.id);

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id),
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Комната с таким номером уже существует в этом здании',
    });
  });

  it('тот же номер в другом здании допустим', async () => {
    const first = await newBuilding();
    const second = await newBuilding();
    await newRoom(first.id);

    const room = await newRoom(second.id);

    expect(room.buildingId).toBe(second.id);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['этаж 1: жилых комнат на первом этаже нет', { floor: 1 }, 'floor'],
    ['этаж 0', { floor: 0 }, 'floor'],
    ['вместимость 1', { capacity: 1 }, 'capacity'],
    ['вместимость 5', { capacity: 5 }, 'capacity'],
    ['номер из одних пробелов', { roomNumber: '   ' }, 'roomNumber'],
    ['лишнее поле', { status: 'free' }, 'status'],
    ['идентификатор здания не UUID', { buildingId: 'not-a-uuid' }, 'buildingId'],
  ])('создание отклоняет: %s (400)', async (_name, overrides, field) => {
    const building = await newBuilding();

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id, overrides),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
    expect(response.body.message).toContain(field);
    expect(await countRooms(building.id)).toBe(0);
  });

  it('пустой объект вместо тела даёт 400', async () => {
    const response = await call(app, 'post', '/api/rooms', { token: adminToken, body: {} });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
  });

  it('несуществующее здание даёт 422', async () => {
    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(randomUUID()),
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ status: 'error', message: 'Здание не найдено' });
  });

  it('этаж выше числа этажей здания даёт 422', async () => {
    const building = await newBuilding({ floorsCount: 5 });

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id, { roomNumber: '601', floor: 6 }),
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('превышает число этажей здания (5)');
    expect(await countRooms(building.id)).toBe(0);
  });

  it('комната на последнем этаже здания допустима', async () => {
    const building = await newBuilding({ floorsCount: 5 });

    const room = await newRoom(building.id, { roomNumber: '501', floor: 5 });

    expect(room.floor).toBe(5);
  });

  it.each<[string, number, string]>([
    ['corridor', 2, '201'],
    ['apartment', 10, '1001'],
    ['block', 7, '7-3-2'],
    ['block', 6, '643'],
  ])('%s, этаж %i: номер «%s» принимается', async (buildingType, floor, roomNumber) => {
    const building = await newBuilding({ buildingType, floorsCount: 16 });

    const room = await newRoom(building.id, { roomNumber, floor });

    expect(room.roomNumber).toBe(roomNumber);
  });

  it.each<[string, number, string]>([
    ['corridor', 3, '201'],
    ['corridor', 2, '2001'],
    ['block', 7, '8-3-2'],
    ['block', 6, '630'],
    ['apartment', 2, '7-3-2'],
  ])('%s, этаж %i: номер «%s» отклоняется (422)', async (buildingType, floor, roomNumber) => {
    const building = await newBuilding({ buildingType, floorsCount: 16 });

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id, { roomNumber, floor }),
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('не соответствует типу здания и этажу');
    expect(response.body.message).toContain('Пример');
    expect(await countRooms(building.id)).toBe(0);
  });

  it('для здания типа block подсказка называет оба формата номера', async () => {
    const building = await newBuilding({ buildingType: 'block', floorsCount: 16 });

    const response = await call(app, 'post', '/api/rooms', {
      token: adminToken,
      body: roomPayload(building.id, { roomNumber: '999', floor: 7 }),
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('7-1-1 или 711');
  });
});

describe('чтение комнат (GET)', () => {
  it('список упорядочен по номеру здания, этажу и номеру комнаты', async () => {
    const first = await newBuilding();
    const second = await newBuilding();
    const inSecond = await newRoom(second.id, { roomNumber: '201', floor: 2 });
    const upperInFirst = await newRoom(first.id, { roomNumber: '301', floor: 3 });
    const lowerInFirst = await newRoom(first.id, { roomNumber: '201', floor: 2 });

    const response = await call(app, 'get', '/api/rooms', { token: adminToken });

    expect(response.status).toBe(200);
    const mine = new Set([inSecond.id, upperInFirst.id, lowerInFirst.id]);
    const order = (response.body.data as RoomBody[])
      .filter((room) => mine.has(room.id))
      .map((room) => room.id);
    expect(order).toEqual([lowerInFirst.id, upperInFirst.id, inSecond.id]);
  });

  it('фильтр ?buildingId= возвращает только комнаты этого здания', async () => {
    const first = await newBuilding();
    const second = await newBuilding();
    const inFirst = await newRoom(first.id, { roomNumber: '201' });
    const alsoInFirst = await newRoom(first.id, { roomNumber: '202' });
    await newRoom(second.id);

    const response = await call(app, 'get', `/api/rooms?buildingId=${first.id}`, {
      token: adminToken,
    });

    expect(response.status).toBe(200);
    const ids = (response.body.data as RoomBody[]).map((room) => room.id);
    expect(ids).toEqual([inFirst.id, alsoInFirst.id]);
  });

  it('фильтр по зданию без комнат возвращает пустой список', async () => {
    const building = await newBuilding();

    const response = await call(app, 'get', `/api/rooms?buildingId=${building.id}`, {
      token: adminToken,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('неизвестный параметр запроса даёт 400', async () => {
    const response = await call(app, 'get', '/api/rooms?foo=1', { token: adminToken });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('foo');
  });

  it('buildingId, не являющийся UUID, даёт 400', async () => {
    const response = await call(app, 'get', '/api/rooms?buildingId=abc', { token: adminToken });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('buildingId');
  });

  it('комната по идентификатору возвращает те же данные, что при создании', async () => {
    const room = await newRoom((await newBuilding()).id);

    expect(await fetchRoom(room.id)).toEqual(room);
  });

  it('неизвестный идентификатор даёт 404', async () => {
    const response = await call(app, 'get', roomUrl(randomUUID()), { token: adminToken });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Комната не найдена' });
  });

  it('некорректный идентификатор даёт 400', async () => {
    const response = await call(app, 'get', '/api/rooms/not-a-uuid', { token: adminToken });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ status: 'error', message: 'Некорректный идентификатор' });
  });

  it('идентификатор в верхнем регистре находит комнату', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'get', roomUrl(room.id.toUpperCase()), {
      token: adminToken,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(room.id);
  });
});

describe('полная замена (PUT)', () => {
  it('полностью заменяет поля комнаты', async () => {
    const building = await newBuilding();
    const room = await newRoom(building.id);
    const next = roomPayload(building.id, { roomNumber: '202', capacity: 2 });

    const response = await call(app, 'put', roomUrl(room.id), { token: adminToken, body: next });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject(next);
    expect(response.body.data.id).toBe(room.id);
  });

  it('PUT без обязательного поля даёт 400 и ничего не меняет', async () => {
    const building = await newBuilding();
    const room = await newRoom(building.id);
    const body: Record<string, unknown> = roomPayload(building.id, { roomNumber: '777' });
    delete body.floor;

    const response = await call(app, 'put', roomUrl(room.id), { token: adminToken, body });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('floor');
    expect(await fetchRoom(room.id)).toEqual(room);
  });

  it('PUT неизвестной комнаты даёт 404', async () => {
    const building = await newBuilding();

    const response = await call(app, 'put', roomUrl(randomUUID()), {
      token: adminToken,
      body: roomPayload(building.id),
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Комната не найдена');
  });

  it('PUT переносит комнату в другое здание', async () => {
    const first = await newBuilding();
    const second = await newBuilding();
    const room = await newRoom(first.id);

    const response = await call(app, 'put', roomUrl(room.id), {
      token: adminToken,
      body: roomPayload(second.id),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.buildingId).toBe(second.id);
    const left = await call(app, 'get', `/api/rooms?buildingId=${first.id}`, {
      token: adminToken,
    });
    expect(left.body.data).toEqual([]);
  });

  it('PUT в несуществующее здание даёт 422 и ничего не меняет', async () => {
    const building = await newBuilding();
    const room = await newRoom(building.id);

    const response = await call(app, 'put', roomUrl(room.id), {
      token: adminToken,
      body: roomPayload(randomUUID()),
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toBe('Здание не найдено');
    expect(await fetchRoom(room.id)).toEqual(room);
  });

  it('PUT с номером, занятым в здании, даёт 409', async () => {
    const building = await newBuilding();
    await newRoom(building.id, { roomNumber: '201' });
    const second = await newRoom(building.id, { roomNumber: '202' });

    const response = await call(app, 'put', roomUrl(second.id), {
      token: adminToken,
      body: roomPayload(building.id, { roomNumber: '201' }),
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Комната с таким номером уже существует в этом здании');
    expect(await fetchRoom(second.id)).toEqual(second);
  });
});

describe('частичное изменение (PATCH)', () => {
  it('меняет только переданные поля', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { capacity: 2 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      ...room,
      capacity: 2,
      updatedAt: expect.any(String),
    });
  });

  it('пустой объект даёт 400', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'patch', roomUrl(room.id), { token: adminToken, body: {} });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
  });

  it('неизвестное поле даёт 400', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { foo: 1 },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('foo');
  });

  it('PATCH неизвестной комнаты даёт 404', async () => {
    const response = await call(app, 'patch', roomUrl(randomUUID()), {
      token: adminToken,
      body: { capacity: 2 },
    });

    expect(response.status).toBe(404);
  });

  it('этаж и номер можно изменить вместе', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { floor: 3, roomNumber: '301' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ floor: 3, roomNumber: '301' });
  });

  it('изменение только этажа проверяется вместе с текущим номером (422)', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { floor: 3 },
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('не соответствует типу здания и этажу');
    expect(await fetchRoom(room.id)).toEqual(room);
  });

  it('перенос в здание другого типа проверяет формат номера (422)', async () => {
    const corridor = await newBuilding({ buildingType: 'corridor' });
    const block = await newBuilding({ buildingType: 'block' });
    const room = await newRoom(corridor.id);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { buildingId: block.id },
    });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain('Пример');
    expect(await fetchRoom(room.id)).toEqual(room);
  });

  it('PATCH с номером, занятым в здании, даёт 409', async () => {
    const building = await newBuilding();
    await newRoom(building.id, { roomNumber: '201' });
    const second = await newRoom(building.id, { roomNumber: '202' });

    const response = await call(app, 'patch', roomUrl(second.id), {
      token: adminToken,
      body: { roomNumber: '201' },
    });

    expect(response.status).toBe(409);
    expect(await fetchRoom(second.id)).toEqual(second);
  });
});

describe('вместимость и койки', () => {
  /** Комната вместимостью 4 с заданным числом коек */
  async function roomWithBeds(bedCount: number, capacity = 4): Promise<RoomBody> {
    const room = await newRoom((await newBuilding()).id, { capacity });
    for (let number = 1; number <= bedCount; number++) {
      await createBed(pool, room.id, number);
    }
    return room;
  }

  it('нельзя уменьшить вместимость ниже числа коек (409)', async () => {
    const room = await roomWithBeds(3);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { capacity: 2 },
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('уже 3 коек');
    expect((await fetchRoom(room.id)).capacity).toBe(4);
  });

  it('можно уменьшить вместимость до числа коек', async () => {
    const room = await roomWithBeds(3);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { capacity: 3 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.capacity).toBe(3);
  });

  it('можно уменьшить вместимость, если коек нет', async () => {
    const room = await roomWithBeds(0);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { capacity: 2 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.capacity).toBe(2);
  });

  it('можно увеличить вместимость при наличии коек', async () => {
    const room = await roomWithBeds(2, 2);

    const response = await call(app, 'patch', roomUrl(room.id), {
      token: adminToken,
      body: { capacity: 4 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.capacity).toBe(4);
  });

  it('PUT с меньшей вместимостью тоже проверяется (409)', async () => {
    const room = await roomWithBeds(3);

    const response = await call(app, 'put', roomUrl(room.id), {
      token: adminToken,
      body: roomPayload(room.buildingId, { capacity: 2 }),
    });

    expect(response.status).toBe(409);
    expect(await fetchRoom(room.id)).toEqual(room);
  });
});

describe('удаление комнат', () => {
  it('удаляет комнату и возвращает её идентификатор', async () => {
    const room = await newRoom((await newBuilding()).id);

    const response = await call(app, 'delete', roomUrl(room.id), { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'success', data: { id: room.id } });
    const after = await call(app, 'get', roomUrl(room.id), { token: adminToken });
    expect(after.status).toBe(404);
  });

  it('удаление неизвестной комнаты даёт 404', async () => {
    const response = await call(app, 'delete', roomUrl(randomUUID()), { token: adminToken });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Комната не найдена');
  });

  it('комната с койками не удаляется (409), а после удаления коек удаляется', async () => {
    const room = await newRoom((await newBuilding()).id);
    const bedId = await createBed(pool, room.id, 1);

    const blocked = await call(app, 'delete', roomUrl(room.id), { token: adminToken });

    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('Нельзя удалить комнату: в ней есть койки');
    await fetchRoom(room.id);

    await pool.query('DELETE FROM beds WHERE id = $1', [bedId]);
    const deleted = await call(app, 'delete', roomUrl(room.id), { token: adminToken });
    expect(deleted.status).toBe(200);
  });
});