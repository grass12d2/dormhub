import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, createBuildingViaApi, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

let admin: TestUser;
let otherAdmin: TestUser;
let adminToken = '';
let studentToken = '';

beforeAll(async () => {
  admin = await createLoginUser(pool, { role: 'admin' });
  otherAdmin = await createLoginUser(pool, { role: 'admin' });
  adminToken = await loginForToken(app, admin);
  studentToken = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
});

afterAll(async () => {
  await pool.end();
});

interface EntryBody {
  id: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

interface NewAudit {
  actor?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
  createdAt?: string;
}

/** Уникальное название действия: записи теста не смешиваются с чужими */
const uniqueAction = () => `test_${randomUUID()}`;

/** Запись в журнал напрямую (вставка разрешена); возвращает идентификатор */
async function insertAudit(action: string, options: NewAudit = {}): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, entity_id, details, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
     RETURNING id::text AS id`,
    [
      options.actor ?? null,
      action,
      options.entityType ?? null,
      options.entityId ?? null,
      JSON.stringify(options.details ?? {}),
      options.ip ?? null,
      options.createdAt ?? null,
    ]
  );
  return Number(result.rows[0].id);
}

const list = (query = '') => call(app, 'get', `/api/audit-logs${query}`, { token: adminToken });
const byAction = (action: string, extra = '') => list(`?action=${action}${extra}`);
const ids = (response: { body: { data: EntryBody[] } }) => response.body.data.map((e) => e.id);

async function countAuditRows(): Promise<number> {
  const result = await pool.query<{ count: string }>('SELECT count(*) AS count FROM audit_logs');
  return Number(result.rows[0].count);
}

describe('доступ и роли', () => {
  it('список без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/audit-logs')).status).toBe(401);
  });

  it('запись по идентификатору без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/audit-logs/1')).status).toBe(401);
  });

  it('студент не может читать журнал (403)', async () => {
    const id = await insertAudit(uniqueAction());

    const listResponse = await call(app, 'get', '/api/audit-logs', { token: studentToken });
    const oneResponse = await call(app, 'get', `/api/audit-logs/${id}`, { token: studentToken });

    expect(listResponse.status).toBe(403);
    expect(oneResponse.status).toBe(403);
  });
});

describe('чтение журнала', () => {
  it('запись возвращается в формате camelCase со всеми полями', async () => {
    const action = uniqueAction();
    const entityId = randomUUID();
    const id = await insertAudit(action, {
      actor: admin.id,
      entityType: 'buildings',
      entityId,
      details: { after: { floorsCount: 5 } },
      ip: '10.1.2.3',
    });

    const response = await byAction(action);

    expect(response.status).toBe(200);
    const entry = (response.body.data as EntryBody[])[0];
    expect(Object.keys(entry).sort()).toEqual([
      'action',
      'actorEmail',
      'actorUserId',
      'createdAt',
      'details',
      'entityId',
      'entityType',
      'id',
      'ipAddress',
    ]);
    expect(entry).toMatchObject({
      id,
      actorUserId: admin.id,
      actorEmail: admin.email,
      action,
      entityType: 'buildings',
      entityId,
      details: { after: { floorsCount: 5 } },
      ipAddress: '10.1.2.3',
    });
    expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
  });

  it('запись без автора, сущности и адреса: поля равны null', async () => {
    const action = uniqueAction();
    await insertAudit(action);

    const response = await byAction(action);

    expect((response.body.data as EntryBody[])[0]).toMatchObject({
      actorUserId: null,
      actorEmail: null,
      entityType: null,
      entityId: null,
      ipAddress: null,
      details: {},
    });
  });

  it('новые записи идут первыми', async () => {
    const action = uniqueAction();
    const first = await insertAudit(action);
    const second = await insertAudit(action);
    const third = await insertAudit(action);

    const response = await byAction(action);

    expect(ids(response)).toEqual([third, second, first]);
    expect(response.body.meta).toEqual({ total: 3, limit: 50, offset: 0 });
  });

  it('постраничный вывод', async () => {
    const action = uniqueAction();
    const first = await insertAudit(action);
    const second = await insertAudit(action);
    await insertAudit(action);

    const response = await byAction(action, '&limit=2&offset=1');

    expect(ids(response)).toEqual([second, first]);
    expect(response.body.meta).toEqual({ total: 3, limit: 2, offset: 1 });
  });

  it('без совпадений: пустой список и total 0', async () => {
    const response = await byAction(uniqueAction());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toEqual({ total: 0, limit: 50, offset: 0 });
  });

  it('чтение журнала не создаёт записей', async () => {
    const id = await insertAudit(uniqueAction());
    const before = await countAuditRows();

    await list('?limit=5');
    await call(app, 'get', `/api/audit-logs/${id}`, { token: adminToken });

    expect(await countAuditRows()).toBe(before);
  });
});

describe('фильтры', () => {
  it('по автору', async () => {
    const action = uniqueAction();
    const mine = await insertAudit(action, { actor: admin.id });
    await insertAudit(action, { actor: otherAdmin.id });
    await insertAudit(action);

    const response = await byAction(action, `&actorUserId=${admin.id}`);

    expect(ids(response)).toEqual([mine]);
    expect(response.body.meta.total).toBe(1);
  });

  it('по типу и идентификатору сущности', async () => {
    const action = uniqueAction();
    const entityId = randomUUID();
    const match = await insertAudit(action, { entityType: 'rooms', entityId });
    await insertAudit(action, { entityType: 'beds', entityId });
    await insertAudit(action, { entityType: 'rooms', entityId: randomUUID() });

    const both = await byAction(action, `&entityType=rooms&entityId=${entityId}`);
    const typeOnly = await byAction(action, '&entityType=beds');

    expect(ids(both)).toEqual([match]);
    expect(typeOnly.body.meta.total).toBe(1);
  });

  it('действие сравнивается точно, а не как начало строки', async () => {
    const tag = uniqueAction();
    const exact = await insertAudit(`${tag}_a`);
    await insertAudit(`${tag}_ab`);

    const response = await byAction(`${tag}_a`);

    expect(ids(response)).toEqual([exact]);
  });

  it('период включает обе границы по датам UTC', async () => {
    const action = uniqueAction();
    const before = await insertAudit(action, { createdAt: '2031-05-09T23:59:59Z' });
    const start = await insertAudit(action, { createdAt: '2031-05-10T00:00:00Z' });
    const end = await insertAudit(action, { createdAt: '2031-05-10T23:59:59Z' });
    const after = await insertAudit(action, { createdAt: '2031-05-11T00:00:00Z' });

    const day = await byAction(action, '&from=2031-05-10&to=2031-05-10');
    const fromOnly = await byAction(action, '&from=2031-05-10');
    const toOnly = await byAction(action, '&to=2031-05-10');

    expect(ids(day)).toEqual([end, start]);
    expect(ids(fromOnly)).toEqual([after, end, start]);
    expect(ids(toOnly)).toEqual([end, start, before]);
  });

  it('действия, выполненные через API, видны в журнале вместе с автором', async () => {
    const building = await createBuildingViaApi(app, pool, adminToken);

    const response = await list(`?entityId=${building.id}`);

    expect(response.status).toBe(200);
    const entries = response.body.data as EntryBody[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'create_building',
      entityType: 'buildings',
      actorUserId: admin.id,
      actorEmail: admin.email,
    });
  });
});

describe('неверные параметры', () => {
  it.each([
    'actorUserId=abc',
    'entityId=abc',
    'from=2031-02-30',
    'to=bad',
    'from=2031-05-11&to=2031-05-10',
    'limit=0',
    'limit=201',
    'offset=-1',
    'foo=1',
    'action=',
    'entityType=',
  ])('параметры «%s» дают 400', async (query) => {
    const response = await list(`?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
  });
});

describe('запись по идентификатору', () => {
  it('возвращает те же данные, что и список', async () => {
    const action = uniqueAction();
    const id = await insertAudit(action, {
      actor: admin.id,
      entityType: 'beds',
      details: { before: { status: 'available' } },
      ip: '10.1.2.4',
    });
    const fromList = (await byAction(action)).body.data[0] as EntryBody;

    const response = await call(app, 'get', `/api/audit-logs/${id}`, { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(fromList);
    expect(response.body.data.details).toEqual({ before: { status: 'available' } });
  });

  it('неизвестный идентификатор даёт 404', async () => {
    const response = await call(app, 'get', '/api/audit-logs/999999999999', { token: adminToken });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Запись журнала не найдена' });
  });

  it.each(['abc', '0', '-1', '1.5'])('некорректный идентификатор «%s» даёт 400', async (value) => {
    const response = await call(app, 'get', `/api/audit-logs/${value}`, { token: adminToken });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ status: 'error', message: 'Некорректный идентификатор' });
  });
});