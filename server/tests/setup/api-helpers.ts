/**
 * Помощники интеграционных тестов HTTP-API.
 * Все данные вымышленные.
 */

import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { postLogin, type TestUser } from './auth-helpers.js';
import type { Db } from './factories.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RequestOptions {
  /** Токен доступа; без него запрос выполняется анонимно */
  token?: string;
  body?: object;
  /** IP-адрес клиента (заголовок X-Forwarded-For) */
  ip?: string;
}

/** Выполнить запрос к приложению */
export function call(
  app: Express,
  method: HttpMethod,
  url: string,
  options: RequestOptions = {}
) {
  let req = request(app)[method](url);
  if (options.token !== undefined) {
    req = req.set('Authorization', `Bearer ${options.token}`);
  }
  if (options.ip !== undefined) {
    req = req.set('X-Forwarded-For', options.ip);
  }
  return options.body === undefined ? req : req.send(options.body);
}

/** Войти под пользователем и вернуть токен доступа */
export async function loginForToken(app: Express, user: TestUser): Promise<string> {
  const response = await postLogin(app, user.email, user.password);
  expect(response.status).toBe(200);
  return response.body.data.token as string;
}

/** Следующий свободный номер общежития */
export async function nextBuildingNumber(db: Db): Promise<number> {
  const result = await db.query<{ next: number }>(
    'SELECT COALESCE(max(building_number), 0) + 1 AS next FROM buildings'
  );
  return result.rows[0].next;
}

/** Корректные данные общежития; поля можно переопределить */
export function buildingPayload(
  buildingNumber: number,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    buildingNumber,
    address: 'ул. Тестовая, д. 1',
    metroStation: 'Озерки',
    buildingType: 'corridor',
    floorsCount: 10,
    monthlyRate: 700,
    ...overrides,
  };
}

export interface BuildingBody {
  id: string;
  buildingNumber: number;
  address: string;
  metroStation: string | null;
  buildingType: string;
  floorsCount: number;
  monthlyRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffBody {
  id: string;
  buildingId: string;
  jobTitle: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Создать общежитие через API от имени администратора */
export async function createBuildingViaApi(
  app: Express,
  db: Db,
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<BuildingBody> {
  const number = await nextBuildingNumber(db);
  const response = await call(app, 'post', '/api/buildings', {
    token,
    body: buildingPayload(number, overrides),
  });
  expect(response.status).toBe(201);
  return response.body.data as BuildingBody;
}

/** Создать сотрудника общежития через API от имени администратора */
export async function createStaffViaApi(
  app: Express,
  token: string,
  buildingId: string,
  overrides: Record<string, unknown> = {}
): Promise<StaffBody> {
  const response = await call(app, 'post', `/api/buildings/${buildingId}/staff`, {
    token,
    body: {
      jobTitle: 'Комендант',
      fullName: 'Иванов Иван Иванович',
      phone: '+7 900 000-00-00',
      ...overrides,
    },
  });
  expect(response.status).toBe(201);
  return response.body.data as StaffBody;
}