/**
 * Помощники интеграционных тестов API комнат.
 * Все данные вымышленные.
 */

import type { Express } from 'express';
import { expect } from 'vitest';
import { call } from './api-helpers.js';

export interface RoomBody {
  id: string;
  buildingId: string;
  roomNumber: string;
  floor: number;
  capacity: number;
  createdAt: string;
  updatedAt: string;
}

/** Корректные данные комнаты для здания типа corridor; поля можно переопределить */
export function roomPayload(
  buildingId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return { buildingId, roomNumber: '201', floor: 2, capacity: 3, ...overrides };
}

/** Создать комнату через API от имени администратора */
export async function createRoomViaApi(
  app: Express,
  token: string,
  buildingId: string,
  overrides: Record<string, unknown> = {}
): Promise<RoomBody> {
  const response = await call(app, 'post', '/api/rooms', {
    token,
    body: roomPayload(buildingId, overrides),
  });
  expect(response.status).toBe(201);
  return response.body.data as RoomBody;
}