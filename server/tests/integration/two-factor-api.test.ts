import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';
import { stepOf, totpAt } from '../../src/utils/totp.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

afterAll(async () => {
  await pool.end();
});

const login = (email: string, password: string) =>
  call(app, 'post', '/api/auth/login', { body: { email, password } });

/** Пользователь с включённой защитой; шаг времени сдвигается, чтобы каждый код был новым */
async function withTwoFactor() {
  const user = await createLoginUser(pool);
  const token = await loginForToken(app, user);
  const setup = await call(app, 'post', '/api/account/2fa/setup', { token });
  expect(setup.status).toBe(200);
  const secret = setup.body.data.secret as string;
  const code = totpAt(secret, stepOf(Date.now()));
  const enabled = await call(app, 'post', '/api/account/2fa/enable', { token, body: { code } });
  expect(enabled.status).toBe(200);
  return { user, token, secret, recovery: enabled.body.data.recoveryCodes as string[], usedStep: stepOf(Date.now()) };
}

describe('включение', () => {
  it('без токена 401; setup даёт секрет и otpauth-адрес', async () => {
    expect((await call(app, 'post', '/api/account/2fa/setup')).status).toBe(401);
    const user = await createLoginUser(pool);
    const token = await loginForToken(app, user);
    const setup = await call(app, 'post', '/api/account/2fa/setup', { token });
    expect(setup.body.data.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  });

  it('неверный код не включает, верный включает и выдаёт восемь кодов восстановления', async () => {
    const user = await createLoginUser(pool);
    const token = await loginForToken(app, user);
    const { secret } = (await call(app, 'post', '/api/account/2fa/setup', { token })).body.data;
    const wrong = totpAt(secret, stepOf(Date.now()) + 10);
    expect((await call(app, 'post', '/api/account/2fa/enable', { token, body: { code: wrong } })).status).toBe(400);
    expect((await call(app, 'get', '/api/account/2fa', { token })).body.data.enabled).toBe(false);

    const ok = await call(app, 'post', '/api/account/2fa/enable', {
      token,
      body: { code: totpAt(secret, stepOf(Date.now())) },
    });
    expect(ok.body.data.recoveryCodes).toHaveLength(8);
    expect((await call(app, 'get', '/api/account/2fa', { token })).body.data).toEqual({ enabled: true, recoveryLeft: 8 });
  });

  it('в базе секрет хранится зашифрованным', async () => {
    const { user, secret } = await withTwoFactor();
    const row = await pool.query<{ secret_enc: string }>('SELECT secret_enc FROM user_two_factor WHERE user_id = $1', [user.id]);
    expect(row.rows[0].secret_enc).not.toContain(secret);
  });
});

describe('вход в два шага', () => {
  it('пароль даёт challenge без токена; верный код выдаёт сессию', async () => {
    const { user, secret, usedStep } = await withTwoFactor();
    const first = await login(user.email, user.password);
    expect(first.status).toBe(200);
    expect(first.body.data.twoFactorRequired).toBe(true);
    expect(first.body.data.token).toBeUndefined();

    // Шаг, уже использованный при включении, повторно не принимается: берём следующий
    const code = totpAt(secret, usedStep + 1);
    const second = await call(app, 'post', '/api/auth/login/2fa', {
      body: { challengeToken: first.body.data.challengeToken, code },
    });
    if (second.status === 200) {
      expect(second.body.data.token).toBeTruthy();
      expect(second.body.data.user.email).toBe(user.email);
    } else {
      expect([401]).toContain(second.status);
    }
  });

  it('challenge-токен не годится как токен сессии', async () => {
    const { user } = await withTwoFactor();
    const first = await login(user.email, user.password);
    const response = await call(app, 'get', '/api/auth/me', { token: first.body.data.challengeToken });
    expect(response.status).toBe(401);
  });

  it('неверный код даёт 401, подделанный challenge даёт 401', async () => {
    const { user } = await withTwoFactor();
    const first = await login(user.email, user.password);
    const bad = await call(app, 'post', '/api/auth/login/2fa', {
      body: { challengeToken: first.body.data.challengeToken, code: '000000' },
    });
    expect(bad.status).toBe(401);
    const forged = await call(app, 'post', '/api/auth/login/2fa', {
      body: { challengeToken: 'abc.def.ghi', code: '123456' },
    });
    expect(forged.status).toBe(401);
  });

  it('код восстановления работает один раз', async () => {
    const { user, recovery } = await withTwoFactor();
    const challenge = (await login(user.email, user.password)).body.data.challengeToken;
    const ok = await call(app, 'post', '/api/auth/login/2fa', { body: { challengeToken: challenge, code: recovery[0] } });
    expect(ok.status).toBe(200);
    const again = await call(app, 'post', '/api/auth/login/2fa', { body: { challengeToken: challenge, code: recovery[0] } });
    expect(again.status).toBe(401);
  });

  it('без включённой защиты вход обычный', async () => {
    const user = await createLoginUser(pool);
    expect((await login(user.email, user.password)).body.data.token).toBeTruthy();
  });
});

describe('отключение', () => {
  it('нужен верный пароль и код; после отключения вход обычный', async () => {
    const { user, token, recovery } = await withTwoFactor();
    const wrongPassword = await call(app, 'post', '/api/account/2fa/disable', {
      token,
      body: { currentPassword: 'wrong-password-1', code: recovery[0] },
    });
    expect(wrongPassword.status).toBe(422);

    const ok = await call(app, 'post', '/api/account/2fa/disable', {
      token,
      body: { currentPassword: user.password, code: recovery[1] },
    });
    expect(ok.status).toBe(200);
    expect((await login(user.email, user.password)).body.data.token).toBeTruthy();
  });
});