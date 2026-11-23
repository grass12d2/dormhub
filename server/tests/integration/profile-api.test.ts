import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createStudent } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

afterAll(async () => {
  await pool.end();
});

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

async function actor(role: 'admin' | 'student') {
  const user = await createLoginUser(pool, { role });
  if (role === 'student') {
    await createStudent(pool, user.id);
  }
  return { user, token: await loginForToken(app, user) };
}

const putAvatar = (token: string, body: Buffer, type = 'image/png') =>
  request(app).put('/api/account/avatar').set('Authorization', `Bearer ${token}`).set('Content-Type', type).send(body);

describe('профиль', () => {
  it('без токена 401', async () => {
    expect((await call(app, 'get', '/api/account/profile')).status).toBe(401);
  });

  it('администратор меняет имя, телефон и должность, null очищает', async () => {
    const { token } = await actor('admin');
    const body = { displayName: 'Иванов И.', phone: '+7 900 123-45-67', jobTitle: 'Комендант' };

    const saved = await call(app, 'patch', '/api/account/profile', { token, body });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject(body);

    const cleared = await call(app, 'patch', '/api/account/profile', { token, body: { jobTitle: null } });
    expect(cleared.body.data).toMatchObject({ displayName: 'Иванов И.', jobTitle: null });
  });

  it('студент меняет телефон, но не имя', async () => {
    const { token } = await actor('student');

    const ok = await call(app, 'patch', '/api/account/profile', {
      token,
      body: { phone: '+7 900 000-00-01' },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.phone).toBe('+7 900 000-00-01');
    expect(ok.body.data.student).not.toBeNull();

    const denied = await call(app, 'patch', '/api/account/profile', { token, body: { displayName: 'Другое' } });
    expect(denied.status).toBe(422);
  });

  it.each([{ phone: '89001234567' }, {}, { foo: 1 }])('неверное тело %j даёт 400', async (body) => {
    const { token } = await actor('admin');
    expect((await call(app, 'patch', '/api/account/profile', { token, body })).status).toBe(400);
  });
});

describe('email', () => {
  it('смена с верным паролем: вход по новому email, аудит записан', async () => {
    const { user, token } = await actor('admin');
    const email = `new-${Date.now()}@example.com`;

    const response = await call(app, 'post', '/api/account/email', {
      token,
      body: { email, currentPassword: user.password },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(email);
    const login = await call(app, 'post', '/api/auth/login', { body: { email, password: user.password } });
    expect(login.status).toBe(200);
    const audit = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'change_email' AND entity_id = $1", [user.id]);
    expect(audit.rowCount).toBe(1);
  });

  it('неверный пароль даёт 422, занятый email даёт 409', async () => {
    const { user, token } = await actor('admin');
    const other = await createLoginUser(pool);

    const wrong = await call(app, 'post', '/api/account/email', {
      token,
      body: { email: 'free-1@example.com', currentPassword: 'wrong-password-1' },
    });
    expect(wrong.status).toBe(422);

    const taken = await call(app, 'post', '/api/account/email', {
      token,
      body: { email: other.email, currentPassword: user.password },
    });
    expect(taken.status).toBe(409);
  });
});

describe('аватар', () => {
  it('без аватара 404, после загрузки отдаётся то же изображение, удаление возвращает 404', async () => {
    const { token } = await actor('admin');
    const authorization = { Authorization: `Bearer ${token}` };
    expect((await request(app).get('/api/account/avatar').set(authorization)).status).toBe(404);

    expect((await putAvatar(token, PNG)).status).toBe(200);
    const got = await request(app).get('/api/account/avatar').set(authorization).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toContain('image/png');
    expect((got.body as Buffer).equals(PNG)).toBe(true);

    expect((await call(app, 'delete', '/api/account/avatar', { token })).status).toBe(200);
    expect((await request(app).get('/api/account/avatar').set(authorization)).status).toBe(404);
  });

  it('файл с типом PNG, но не изображение, отклоняется (422)', async () => {
    const { token } = await actor('admin');
    expect((await putAvatar(token, Buffer.from('not an image at all'))).status).toBe(422);
  });

  it('больше 2 МБ отклоняется', async () => {
    const { token } = await actor('admin');
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect([413, 422]).toContain((await putAvatar(token, big)).status);
  });

  it('неподдерживаемый тип не принимается', async () => {
    const { token } = await actor('admin');
    expect((await putAvatar(token, PNG, 'image/gif')).status).toBeGreaterThanOrEqual(400);
  });
});