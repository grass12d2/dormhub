import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAuthenticate, requireAdmin } from '../../src/middleware/auth.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js';
import { AuthService, INVALID_CREDENTIALS_MESSAGE } from '../../src/services/auth.service.js';
import { signAccessToken, TOKEN_ISSUER } from '../../src/utils/token.js';
import { createTestAppOptions, TEST_JWT_SECRET } from '../setup/app-options.js';
import { createLoginUser, nextIp, postLogin, type TestUser } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

afterAll(async () => {
  await pool.end();
});

async function loginToken(user: TestUser): Promise<string> {
  const response = await postLogin(app, user.email, user.password);
  expect(response.status).toBe(200);
  return response.body.data.token as string;
}

function getMe(token: string) {
  return request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
}

async function readLastLogin(userId: string): Promise<Date | null> {
  const result = await pool.query<{ last_login_at: Date | null }>(
    'SELECT last_login_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0].last_login_at;
}

describe('POST /api/auth/login', () => {
  it('успешный вход возвращает токен, срок действия и пользователя', async () => {
    const user = await createLoginUser(pool);

    const response = await postLogin(app, user.email, user.password);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(response.body.data.expiresIn).toBe(3600);
    expect(response.body.data.user).toEqual({ id: user.id, email: user.email, role: 'admin' });
  });

  it('ответ не содержит хеш пароля', async () => {
    const user = await createLoginUser(pool);

    const response = await postLogin(app, user.email, user.password);

    expect(response.text).not.toContain('password');
    expect(response.text).not.toContain('$2');
  });

  it('email не зависит от регистра', async () => {
    const user = await createLoginUser(pool);

    const response = await postLogin(app, user.email.toUpperCase(), user.password);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(user.email);
  });

  it('пробелы вокруг email игнорируются', async () => {
    const user = await createLoginUser(pool);

    const response = await postLogin(app, `  ${user.email}  `, user.password);

    expect(response.status).toBe(200);
  });

  it('неверный пароль даёт 401 с общим сообщением', async () => {
    const user = await createLoginUser(pool);

    const response = await postLogin(app, user.email, 'wrong-password-1');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ status: 'error', message: INVALID_CREDENTIALS_MESSAGE });
  });

  it('неизвестный email даёт точно такой же ответ, как неверный пароль', async () => {
    const user = await createLoginUser(pool);

    const unknown = await postLogin(app, `nobody-${randomUUID()}@example.com`, 'wrong-password-1');
    const wrongPassword = await postLogin(app, user.email, 'wrong-password-1');

    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrongPassword.body);
  });

  it('отключённый пользователь не входит даже с верным паролем', async () => {
    const user = await createLoginUser(pool, { active: false });

    const response = await postLogin(app, user.email, user.password);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('успешный вход обновляет время последнего входа', async () => {
    const user = await createLoginUser(pool);
    expect(await readLastLogin(user.id)).toBeNull();

    await postLogin(app, user.email, user.password);

    expect(await readLastLogin(user.id)).toBeInstanceOf(Date);
  });

  it('неудачный вход не обновляет время последнего входа', async () => {
    const user = await createLoginUser(pool);

    await postLogin(app, user.email, 'wrong-password-1');

    expect(await readLastLogin(user.id)).toBeNull();
  });

  it('пустое тело запроса даёт 400', async () => {
    const response = await postLogin(app, '', '');
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Укажите корректные email и пароль');
  });

  it('лишнее поле в запросе даёт 400', async () => {
    const user = await createLoginUser(pool);

    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: user.email, password: user.password, role: 'admin' });

    expect(response.status).toBe(400);
  });

  it('некорректный email даёт 400', async () => {
    const response = await postLogin(app, 'not-an-email', 'whatever-password');
    expect(response.status).toBe(400);
  });

  it('слишком длинный пароль даёт 400', async () => {
    const user = await createLoginUser(pool);

    const response = await postLogin(app, user.email, 'x'.repeat(129));

    expect(response.status).toBe(400);
  });

  it('запрос без тела даёт 400', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', nextIp());

    expect(response.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('без заголовка Authorization даёт 401', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ status: 'error', message: 'Требуется аутентификация' });
  });

  it('схема авторизации не Bearer даёт 401', async () => {
    const response = await request(app).get('/api/auth/me').set('Authorization', 'Basic abc');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Требуется аутентификация');
  });

  it('произвольная строка вместо токена даёт 401', async () => {
    const response = await getMe('abc');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Недействительный токен');
  });

  it('токен, выданный при входе, открывает доступ и возвращает пользователя', async () => {
    const user = await createLoginUser(pool, { role: 'student' });

    const response = await getMe(await loginToken(user));

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({ id: user.id, email: user.email, role: 'student' });
  });

  it('ответ не содержит хеш пароля', async () => {
    const user = await createLoginUser(pool);

    const response = await getMe(await loginToken(user));

    expect(response.text).not.toContain('password');
    expect(response.text).not.toContain('$2');
  });

  it('просроченный токен даёт 401 с отдельным сообщением', async () => {
    const user = await createLoginUser(pool);
    const token = jwt.sign(
      { role: user.role, exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', issuer: TOKEN_ISSUER, subject: user.id }
    );

    const response = await getMe(token);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/Срок действия/);
  });

  it('токен, подписанный чужим секретом, отклоняется', async () => {
    const user = await createLoginUser(pool);
    const token = signAccessToken({ userId: user.id, role: user.role }, 'x'.repeat(40), 60);

    const response = await getMe(token);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Недействительный токен');
  });

  it('отключённый пользователь теряет доступ сразу, не дожидаясь конца срока токена', async () => {
    const user = await createLoginUser(pool);
    const token = await loginToken(user);
    expect((await getMe(token)).status).toBe(200);

    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

    const response = await getMe(token);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Недействительный токен');
  });

  it('удалённый пользователь теряет доступ сразу', async () => {
    const user = await createLoginUser(pool);
    const token = await loginToken(user);

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    expect((await getMe(token)).status).toBe(401);
  });

  it('смена роли пользователя аннулирует выданные токены', async () => {
    const user = await createLoginUser(pool, { role: 'admin' });
    const token = await loginToken(user);

    await pool.query("UPDATE users SET role = 'student' WHERE id = $1", [user.id]);

    expect((await getMe(token)).status).toBe(401);
  });
});

describe('проверка ролей', () => {
  /** Минимальное приложение с маршрутом только для администраторов */
  function buildRoleApp() {
    const service = new AuthService(pool, createTestAppOptions().auth);
    const authenticate = createAuthenticate(service);
    const roleApp = express();
    roleApp.get('/admin-only', authenticate, requireAdmin, (_req, res) => {
      res.json({ status: 'success' });
    });
    roleApp.use(notFoundHandler);
    roleApp.use(errorHandler);
    return roleApp;
  }

  it('администратор получает доступ к маршруту для администраторов', async () => {
    const admin = await createLoginUser(pool, { role: 'admin' });

    const response = await request(buildRoleApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${await loginToken(admin)}`);

    expect(response.status).toBe(200);
  });

  it('студент получает 403 на маршруте для администраторов', async () => {
    const student = await createLoginUser(pool, { role: 'student' });

    const response = await request(buildRoleApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${await loginToken(student)}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Недостаточно прав для выполнения операции');
  });

  it('запрос без токена получает 401, а не 403', async () => {
    const response = await request(buildRoleApp()).get('/admin-only');

    expect(response.status).toBe(401);
  });
});