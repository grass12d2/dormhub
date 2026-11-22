import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import {
  call,
  createStaffViaApi,
  loginForToken,
  type HttpMethod,
  type StaffBody,
} from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createBuilding } from '../setup/factories.js';
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

const staffUrl = (buildingId: string, staffId?: string) =>
  staffId === undefined
    ? `/api/buildings/${buildingId}/staff`
    : `/api/buildings/${buildingId}/staff/${staffId}`;

async function listStaff(buildingId: string): Promise<StaffBody[]> {
  const response = await call(app, 'get', staffUrl(buildingId), { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as StaffBody[];
}

describe('доступ и роли', () => {
  it('список сотрудников без токена даёт 401', async () => {
    const buildingId = await createBuilding(pool);

    const response = await call(app, 'get', staffUrl(buildingId));

    expect(response.status).toBe(401);
  });

  it('студент читает список сотрудников', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, 'get', staffUrl(buildingId), { token: studentToken });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([staff]);
  });

  it('студент не может добавлять сотрудника (403)', async () => {
    const buildingId = await createBuilding(pool);

    const response = await call(app, 'post', staffUrl(buildingId), {
      token: studentToken,
      body: { jobTitle: 'Комендант', fullName: 'Иванов Иван' },
    });

    expect(response.status).toBe(403);
    expect(await listStaff(buildingId)).toEqual([]);
  });

  it.each<[string, HttpMethod, object | undefined]>([
    ['PUT', 'put', { jobTitle: 'Чужая должность', fullName: 'Чужое Имя' }],
    ['PATCH', 'patch', { jobTitle: 'Чужая должность' }],
    ['DELETE', 'delete', undefined],
  ])('студент не может изменять сотрудника: %s (403)', async (_name, method, body) => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, method, staffUrl(buildingId, staff.id), {
      token: studentToken,
      body,
    });

    expect(response.status).toBe(403);
    expect(await listStaff(buildingId)).toEqual([staff]);
  });
});

describe('добавление сотрудников (POST)', () => {
  it('возвращает сотрудника в формате camelCase', async () => {
    const buildingId = await createBuilding(pool);

    const staff = await createStaffViaApi(app, adminToken, buildingId);

    expect(Object.keys(staff).sort()).toEqual([
      'buildingId',
      'createdAt',
      'fullName',
      'id',
      'jobTitle',
      'phone',
      'updatedAt',
    ]);
    expect(staff).toMatchObject({
      buildingId,
      jobTitle: 'Комендант',
      fullName: 'Иванов Иван Иванович',
      phone: '+7 900 000-00-00',
    });
  });

  it('телефон по умолчанию null', async () => {
    const buildingId = await createBuilding(pool);
    const response = await call(app, 'post', staffUrl(buildingId), {
      token: adminToken,
      body: { jobTitle: 'Вахтёр', fullName: 'Сидоров Сидор' },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.phone).toBeNull();
  });

  it('обрезает пробелы по краям', async () => {
    const buildingId = await createBuilding(pool);

    const staff = await createStaffViaApi(app, adminToken, buildingId, {
      jobTitle: '  Комендант  ',
      fullName: ' Иванов Иван ',
    });

    expect(staff.jobTitle).toBe('Комендант');
    expect(staff.fullName).toBe('Иванов Иван');
  });

  it('должность — произвольный русский текст', async () => {
    const buildingId = await createBuilding(pool);

    const staff = await createStaffViaApi(app, adminToken, buildingId, {
      jobTitle: 'Заведующий общежитием (по совместительству)',
    });

    expect(staff.jobTitle).toBe('Заведующий общежитием (по совместительству)');
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['должность из одних пробелов', { jobTitle: '   ' }, 'jobTitle'],
    ['пустое ФИО', { fullName: '' }, 'fullName'],
    ['телефон из одних пробелов', { phone: '  ' }, 'phone'],
    ['лишнее поле', { role: 'admin' }, 'role'],
  ])('создание отклоняет: %s (400)', async (_name, overrides, field) => {
    const buildingId = await createBuilding(pool);

    const response = await call(app, 'post', staffUrl(buildingId), {
      token: adminToken,
      body: { jobTitle: 'Комендант', fullName: 'Иванов Иван', ...overrides },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(field);
    expect(await listStaff(buildingId)).toEqual([]);
  });

  it('создание в несуществующем здании даёт 404', async () => {
    const response = await call(app, 'post', staffUrl(randomUUID()), {
      token: adminToken,
      body: { jobTitle: 'Комендант', fullName: 'Иванов Иван' },
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Здание не найдено' });
  });

  it('некорректный идентификатор здания даёт 400', async () => {
    const response = await call(app, 'post', '/api/buildings/not-a-uuid/staff', {
      token: adminToken,
      body: { jobTitle: 'Комендант', fullName: 'Иванов Иван' },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Некорректный идентификатор');
  });
});

describe('чтение сотрудников (GET)', () => {
  it('возвращает сотрудников только своего здания', async () => {
    const buildingA = await createBuilding(pool);
    const buildingB = await createBuilding(pool);
    const staffA = await createStaffViaApi(app, adminToken, buildingA);
    await createStaffViaApi(app, adminToken, buildingB, { fullName: 'Петров Пётр' });

    const list = await listStaff(buildingA);

    expect(list.map((member) => member.id)).toEqual([staffA.id]);
  });

  it('список сотрудников здания без сотрудников пуст', async () => {
    const buildingId = await createBuilding(pool);

    expect(await listStaff(buildingId)).toEqual([]);
  });

  it('список сотрудников неизвестного здания даёт 404', async () => {
    const response = await call(app, 'get', staffUrl(randomUUID()), { token: adminToken });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Здание не найдено');
  });
});

describe('замена и изменение сотрудников', () => {
  it('PUT заменяет все поля, отсутствующий телефон становится null', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, 'put', staffUrl(buildingId, staff.id), {
      token: adminToken,
      body: { jobTitle: 'Дежурный', fullName: 'Петров Пётр' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: staff.id,
      buildingId,
      jobTitle: 'Дежурный',
      fullName: 'Петров Пётр',
      phone: null,
    });
  });

  it('PATCH меняет только переданные поля', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, 'patch', staffUrl(buildingId, staff.id), {
      token: adminToken,
      body: { jobTitle: 'Старший комендант' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      ...staff,
      jobTitle: 'Старший комендант',
      updatedAt: expect.any(String),
    });
  });

  it('PATCH с null очищает телефон', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, 'patch', staffUrl(buildingId, staff.id), {
      token: adminToken,
      body: { phone: null },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBeNull();
    expect(response.body.data.fullName).toBe(staff.fullName);
  });

  it('PATCH с пустым объектом даёт 400', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, 'patch', staffUrl(buildingId, staff.id), {
      token: adminToken,
      body: {},
    });

    expect(response.status).toBe(400);
  });

  it('сотрудник не изменяется по пути чужого здания (404)', async () => {
    const buildingA = await createBuilding(pool);
    const buildingB = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingA);

    const response = await call(app, 'patch', staffUrl(buildingB, staff.id), {
      token: adminToken,
      body: { jobTitle: 'Взлом' },
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Сотрудник не найден');
    expect(await listStaff(buildingA)).toEqual([staff]);
  });

  it('неизвестный сотрудник даёт 404', async () => {
    const buildingId = await createBuilding(pool);

    const response = await call(app, 'put', staffUrl(buildingId, randomUUID()), {
      token: adminToken,
      body: { jobTitle: 'Дежурный', fullName: 'Петров Пётр' },
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Сотрудник не найден');
  });
});

describe('удаление сотрудников', () => {
  it('удаляет сотрудника и возвращает его идентификатор', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const response = await call(app, 'delete', staffUrl(buildingId, staff.id), {
      token: adminToken,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'success', data: { id: staff.id } });
    expect(await listStaff(buildingId)).toEqual([]);
  });

  it('сотрудник не удаляется по пути чужого здания (404)', async () => {
    const buildingA = await createBuilding(pool);
    const buildingB = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingA);

    const response = await call(app, 'delete', staffUrl(buildingB, staff.id), {
      token: adminToken,
    });

    expect(response.status).toBe(404);
    expect(await listStaff(buildingA)).toEqual([staff]);
  });

  it('удаление неизвестного сотрудника даёт 404', async () => {
    const buildingId = await createBuilding(pool);

    const response = await call(app, 'delete', staffUrl(buildingId, randomUUID()), {
      token: adminToken,
    });

    expect(response.status).toBe(404);
  });

  it('здание удаляется только после удаления всех его сотрудников', async () => {
    const buildingId = await createBuilding(pool);
    const staff = await createStaffViaApi(app, adminToken, buildingId);

    const blocked = await call(app, 'delete', `/api/buildings/${buildingId}`, {
      token: adminToken,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('Нельзя удалить здание: у него есть сотрудники');

    const staffDeleted = await call(app, 'delete', staffUrl(buildingId, staff.id), {
      token: adminToken,
    });
    expect(staffDeleted.status).toBe(200);

    const buildingDeleted = await call(app, 'delete', `/api/buildings/${buildingId}`, {
      token: adminToken,
    });
    expect(buildingDeleted.status).toBe(200);
  });
});