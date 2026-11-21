import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import {
  INVALID_CREDENTIALS_MESSAGE,
  LOGIN_EMAIL_FAILURE_LIMIT,
  LOGIN_FAILURE_WINDOW_MS,
  LOGIN_IP_FAILURE_LIMIT,
  LOGIN_PAIR_FAILURE_LIMIT,
} from '../../src/services/auth.service.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { createLoginUser, nextIp, postLogin } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

/** Управляемые часы: окно блокировки проверяется без реального ожидания */
function createClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Новое приложение: у каждого теста свои счётчики попыток */
function freshApp(now?: () => number): Express {
  return createApp(pool, createTestAppOptions(now ? { now } : {}));
}

/** Неудачные входы подряд; каждый обязан быть отклонён как неверные учётные данные */
async function failTimes(app: Express, email: string, ip: string, times: number): Promise<void> {
  for (let attempt = 0; attempt < times; attempt++) {
    const response = await postLogin(app, email, 'wrong-password-1', ip);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  }
}

describe('ограничение неудачных попыток входа', () => {
  it('после лимита неудач эта пара «IP + email» блокируется даже с верным паролем (429)', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);
    const ip = nextIp();

    await failTimes(app, user.email, ip, LOGIN_PAIR_FAILURE_LIMIT);
    const blocked = await postLogin(app, user.email, user.password, ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.status).toBe('error');
    expect(blocked.body.message).toMatch(/Слишком много/);
  });

  it('на одну неудачу меньше лимита не блокирует', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);
    const ip = nextIp();

    await failTimes(app, user.email, ip, LOGIN_PAIR_FAILURE_LIMIT - 1);
    const response = await postLogin(app, user.email, user.password, ip);

    expect(response.status).toBe(200);
  });

  it('блокировка не затрагивает другого пользователя с того же IP', async () => {
    const app = freshApp();
    const careless = await createLoginUser(pool);
    const neighbour = await createLoginUser(pool);
    const ip = nextIp();

    await failTimes(app, careless.email, ip, LOGIN_PAIR_FAILURE_LIMIT);
    const response = await postLogin(app, neighbour.email, neighbour.password, ip);

    expect(response.status).toBe(200);
  });

  it('блокировка не затрагивает того же пользователя с другого IP', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);
    const blockedIp = nextIp();

    await failTimes(app, user.email, blockedIp, LOGIN_PAIR_FAILURE_LIMIT);
    const response = await postLogin(app, user.email, user.password, nextIp());

    expect(response.status).toBe(200);
  });

  it('успешный вход сбрасывает счётчик этой пары', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);
    const ip = nextIp();

    await failTimes(app, user.email, ip, LOGIN_PAIR_FAILURE_LIMIT - 1);
    expect((await postLogin(app, user.email, user.password, ip)).status).toBe(200);
    await failTimes(app, user.email, ip, LOGIN_PAIR_FAILURE_LIMIT - 1);
    const response = await postLogin(app, user.email, user.password, ip);

    // Без сброса накопилось бы 2 × (лимит − 1) неудач и вход был бы заблокирован
    expect(response.status).toBe(200);
  });

  it('блокировка снимается по истечении окна', async () => {
    const clock = createClock();
    const app = freshApp(clock.now);
    const user = await createLoginUser(pool);
    const ip = nextIp();

    await failTimes(app, user.email, ip, LOGIN_PAIR_FAILURE_LIMIT);
    expect((await postLogin(app, user.email, user.password, ip)).status).toBe(429);

    clock.advance(LOGIN_FAILURE_WINDOW_MS);

    expect((await postLogin(app, user.email, user.password, ip)).status).toBe(200);
  });

  it('несуществующий email блокируется так же, как существующий', async () => {
    const app = freshApp();
    const email = `nobody-${randomUUID()}@example.com`;
    const ip = nextIp();

    await failTimes(app, email, ip, LOGIN_PAIR_FAILURE_LIMIT);
    const response = await postLogin(app, email, 'another-password-1', ip);

    expect(response.status).toBe(429);
  });

  it('подбор пароля с разных IP упирается в общий лимит по email', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);

    for (let attempt = 0; attempt < LOGIN_EMAIL_FAILURE_LIMIT; attempt++) {
      await failTimes(app, user.email, nextIp(), 1);
    }
    const response = await postLogin(app, user.email, user.password, nextIp());

    expect(response.status).toBe(429);
  });

  it('успешные входы не сбрасывают общий счётчик email', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);

    for (let attempt = 0; attempt < LOGIN_EMAIL_FAILURE_LIMIT - 1; attempt++) {
      await failTimes(app, user.email, nextIp(), 1);
    }
    expect((await postLogin(app, user.email, user.password, nextIp())).status).toBe(200);
    await failTimes(app, user.email, nextIp(), 1);
    const response = await postLogin(app, user.email, user.password, nextIp());

    expect(response.status).toBe(429);
  });

  it('перебор множества email с одного IP упирается в лимит по IP, другие адреса не затронуты', async () => {
    const app = freshApp();
    const user = await createLoginUser(pool);
    const ip = nextIp();

    for (let attempt = 0; attempt < LOGIN_IP_FAILURE_LIMIT; attempt++) {
      await failTimes(app, `nobody-${randomUUID()}@example.com`, ip, 1);
    }

    expect((await postLogin(app, user.email, user.password, ip)).status).toBe(429);
    expect((await postLogin(app, user.email, user.password, nextIp())).status).toBe(200);
  });
});