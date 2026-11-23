import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createMemoryMailer } from '../../src/services/mailer.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call } from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const mailer = createMemoryMailer();
const app = createApp(pool, createTestAppOptions({}, mailer));

afterAll(async () => {
  await pool.end();
});

const NEW = 'brand-new-password-1';
const forgot = (email: string) => call(app, 'post', '/api/auth/forgot-password', { body: { email } });
const reset = (email: string, code: string, newPassword = NEW) =>
  call(app, 'post', '/api/auth/reset-password', { body: { email, code, newPassword } });
const login = (email: string, password: string) =>
  call(app, 'post', '/api/auth/login', { body: { email, password } });

/** Код из последнего письма адресату */
function lastCode(email: string): string {
  const mail = [...mailer.sent].reverse().find((m) => m.to === email);
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('Письмо с кодом не найдено');
  return code;
}

describe('запрос кода', () => {
  it('известный и неизвестный email получают одинаковый ответ, письмо уходит только известному', async () => {
    const user = await createLoginUser(pool);
    const known = await forgot(user.email);
    const unknown = await forgot(`nobody-${Date.now()}@example.com`);

    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(mailer.sent.some((m) => m.to === user.email)).toBe(true);
    expect(mailer.sent.some((m) => m.to.startsWith('nobody-'))).toBe(false);
  });

  it('в базе хранится хеш, а не сам код', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    const code = lastCode(user.email);

    const rows = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM password_reset_codes WHERE user_id = $1',
      [user.id]
    );

    expect(rows.rows[0].code_hash).not.toContain(code);
    expect(rows.rows[0].code_hash).toHaveLength(64);
  });

  it('четвёртый запрос подряд получает 429', async () => {
    const user = await createLoginUser(pool);
    for (let i = 0; i < 3; i++) expect((await forgot(user.email)).status).toBe(200);
    expect((await forgot(user.email)).status).toBe(429);
  });

  it('неверный email даёт 400', async () => {
    expect((await forgot('not-an-email')).status).toBe(400);
  });
});

describe('смена пароля по коду', () => {
  it('верный код меняет пароль, код одноразовый, аудит записан', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    const code = lastCode(user.email);

    const ok = await reset(user.email, code);

    expect(ok.status).toBe(200);
    expect((await login(user.email, NEW)).status).toBe(200);
    expect((await login(user.email, user.password)).status).toBe(401);
    expect((await reset(user.email, code, 'another-password-22')).status).toBe(400);
    const audit = await pool.query(
      "SELECT 1 FROM audit_logs WHERE action = 'reset_password' AND entity_id = $1",
      [user.id]
    );
    expect(audit.rowCount).toBe(1);
  });

  it('неверный код даёт 400 и не меняет пароль', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    const wrong = lastCode(user.email) === '000000' ? '111111' : '000000';

    expect((await reset(user.email, wrong)).status).toBe(400);
    expect((await login(user.email, user.password)).status).toBe(200);
  });

  it('после пяти неверных попыток верный код тоже не работает', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    const code = lastCode(user.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await reset(user.email, wrong)).status).toBe(400);

    expect((await reset(user.email, code)).status).toBe(400);
    expect((await login(user.email, user.password)).status).toBe(200);
  });

  it('просроченный код отклоняется', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    const code = lastCode(user.email);
    await pool.query(
      "UPDATE password_reset_codes SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
      [user.id]
    );

    expect((await reset(user.email, code)).status).toBe(400);
  });

  it('новый запрос заменяет прежний код', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    const first = lastCode(user.email);
    await forgot(user.email);
    const second = lastCode(user.email);
    if (first === second) return;

    expect((await reset(user.email, first)).status).toBe(400);
    expect((await reset(user.email, second)).status).toBe(200);
  });

  it('короткий новый пароль даёт 400, лишнее поле даёт 400', async () => {
    const user = await createLoginUser(pool);
    await forgot(user.email);
    expect((await reset(user.email, lastCode(user.email), 'short')).status).toBe(400);
    const extra = await call(app, 'post', '/api/auth/reset-password', {
      body: { email: user.email, code: '123456', newPassword: NEW, x: 1 },
    });
    expect(extra.status).toBe(400);
  });
});