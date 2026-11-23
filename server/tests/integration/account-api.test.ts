import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call } from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

afterAll(async () => {
  await pool.end();
});

const NEW_PASSWORD = 'new-password-12345';

async function login(email: string, password: string) {
  return call(app, 'post', '/api/auth/login', { body: { email, password } });
}

async function session() {
  const user = await createLoginUser(pool, { role: 'student' });
  const response = await login(user.email, user.password);
  expect(response.status).toBe(200);
  return { user, token: response.body.data.token as string };
}

const change = (token: string, currentPassword: string, newPassword: string) =>
  call(app, 'post', '/api/account/password', { token, body: { currentPassword, newPassword } });

describe('смена пароля', () => {
  it('без токена 401', async () => {
    const response = await call(app, 'post', '/api/account/password', {
      body: { currentPassword: 'a', newPassword: 'b' },
    });
    expect(response.status).toBe(401);
  });

  it('успех: войти можно с новым паролем, со старым нельзя', async () => {
    const { user, token } = await session();

    const response = await change(token, user.password, NEW_PASSWORD);

    expect(response.status).toBe(200);
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    expect((await login(user.email, user.password)).status).toBe(401);
  });

  it('неверный текущий пароль даёт 422, пароль не меняется', async () => {
    const { user, token } = await session();

    const response = await change(token, 'wrong-password-1', NEW_PASSWORD);

    expect(response.status).toBe(422);
    expect(response.body.message).toBe('Неверный текущий пароль');
    expect((await login(user.email, user.password)).status).toBe(200);
  });

  it('короткий новый пароль даёт 400', async () => {
    const { user, token } = await session();
    expect((await change(token, user.password, 'short')).status).toBe(400);
  });

  it('новый пароль, равный текущему, даёт 400', async () => {
    const { user, token } = await session();
    const response = await change(token, user.password, user.password);
    expect(response.status).toBe(400);
  });

  it('лишнее поле даёт 400', async () => {
    const { user, token } = await session();
    const response = await call(app, 'post', '/api/account/password', {
      token,
      body: { currentPassword: user.password, newPassword: NEW_PASSWORD, extra: 1 },
    });
    expect(response.status).toBe(400);
  });

  it('аудит записан и не содержит паролей', async () => {
    const { user, token } = await session();
    await change(token, user.password, NEW_PASSWORD);

    const rows = await pool.query<{ details: unknown }>(
      "SELECT details FROM audit_logs WHERE action = 'change_password' AND entity_id = $1",
      [user.id]
    );

    expect(rows.rows).toHaveLength(1);
    expect(JSON.stringify(rows.rows[0].details)).not.toContain(NEW_PASSWORD);
  });

  it('после пяти неверных попыток следующая получает 429', async () => {
    const { user, token } = await session();
    for (let i = 0; i < 5; i++) {
      expect((await change(token, 'wrong-password-1', NEW_PASSWORD)).status).toBe(422);
    }

    const response = await change(token, user.password, NEW_PASSWORD);

    expect(response.status).toBe(429);
  });
});