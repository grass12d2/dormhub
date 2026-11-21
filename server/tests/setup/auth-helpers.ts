/**
 * Помощники тестов аутентификации.
 * Адреса и пароли вымышленные.
 */

import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { createUser } from '../../src/services/users.service.js';
import type { UserRole } from '../../src/types/auth.js';

export const TEST_PASSWORD = 'Correct-Horse-42';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginUserOptions {
  role?: UserRole;
  active?: boolean;
}

/** Пользователь с уникальным email и известным паролем */
export async function createLoginUser(
  pool: Pool,
  options: LoginUserOptions = {}
): Promise<TestUser> {
  const { role = 'admin', active = true } = options;
  const email = `login-${randomUUID()}@example.com`;

  const user = await createUser(
    pool,
    { email, password: TEST_PASSWORD, role },
    { bcryptRounds: 4 }
  );
  if (!active) {
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
  }

  return { id: user.id, email: user.email, password: TEST_PASSWORD, role };
}

let ipCounter = 0;

/** Уникальный вымышленный IP-адрес для каждого вызова */
export function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

/** Запрос входа; IP-адрес клиента задаётся заголовком X-Forwarded-For */
export function postLogin(app: Express, email: string, password: string, ip: string = nextIp()) {
  return request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
}