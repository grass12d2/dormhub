import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import {
  createBed,
  createBuilding,
  createContract,
  createRoom,
  createStudent,
  type ContractStatus,
} from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

let admin: TestUser;
let adminToken = '';
let studentToken = '';

beforeAll(async () => {
  admin = await createLoginUser(pool, { role: 'admin' });
  adminToken = await loginForToken(app, admin);
  // Учётная запись студента без профиля
  studentToken = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
});

afterAll(async () => {
  await pool.end();
});

interface InvoiceBody {
  id: string;
  invoiceNumber: number;
  contractId: string;
  description: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  issueDate: string;
  dueDate: string;
  status: string;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Договор с новой койкой и студентом; студент может быть привязан к учётной записи */
async function newContract(
  status: ContractStatus = 'active',
  studentUserId: string | null = null
): Promise<string> {
  const bedId = await createBed(pool, await createRoom(pool, await createBuilding(pool)), 1);
  const studentId = await createStudent(pool, studentUserId);
  return createContract(pool, {
    studentId,
    bedId,
    startDate: '2030-09-01',
    endDate: '2030-12-01',
    createdBy: admin.id,
    status,
  });
}

function invoicePayload(
  contractId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    contractId,
    description: 'Оплата за сентябрь',
    amount: 2700,
    dueDate: '2099-01-01',
    ...overrides,
  };
}

const postInvoice = (body: object, ip?: string) =>
  call(app, 'post', '/api/invoices', { token: adminToken, body, ip });

async function newInvoice(
  overrides: Record<string, unknown> = {},
  contractId?: string
): Promise<InvoiceBody> {
  const id = contractId ?? (await newContract());
  const response = await postInvoice(invoicePayload(id, overrides));
  expect(response.status).toBe(201);
  return response.body.data as InvoiceBody;
}

const invoiceUrl = (id: string) => `/api/invoices/${id}`;

const cancelInvoice = (id: string) =>
  call(app, 'post', `${invoiceUrl(id)}/cancel`, { token: adminToken });

const pay = (invoiceId: string, amount: number) =>
  call(app, 'post', '/api/payments', {
    token: adminToken,
    body: { invoiceId, amount, method: 'cash' },
  });

async function fetchInvoice(id: string): Promise<InvoiceBody> {
  const response = await call(app, 'get', invoiceUrl(id), { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as InvoiceBody;
}

interface AuditRow {
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
  ip: string | null;
}

async function auditFor(entityId: string): Promise<AuditRow[]> {
  const result = await pool.query<AuditRow>(
    `SELECT actor_user_id, action, entity_type, details, host(ip_address) AS ip
     FROM audit_logs WHERE entity_id = $1 ORDER BY id`,
    [entityId]
  );
  return result.rows;
}

async function countAudits(action: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) AS count FROM audit_logs WHERE action = $1',
    [action]
  );
  return Number(result.rows[0].count);
}

describe('доступ и роли', () => {
  it('список счетов без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/invoices')).status).toBe(401);
  });

  it('студент не может читать общий список (403)', async () => {
    expect((await call(app, 'get', '/api/invoices', { token: studentToken })).status).toBe(403);
  });

  it('студент не может выставлять счёт (403)', async () => {
    const contractId = await newContract();

    const response = await call(app, 'post', '/api/invoices', {
      token: studentToken,
      body: invoicePayload(contractId),
    });

    expect(response.status).toBe(403);
    const stored = await pool.query('SELECT 1 FROM invoices WHERE contract_id = $1', [contractId]);
    expect(stored.rowCount).toBe(0);
  });

  it('студент не может изменять и отменять счёт (403)', async () => {
    const invoice = await newInvoice();

    const patched = await call(app, 'patch', invoiceUrl(invoice.id), {
      token: studentToken,
      body: { description: 'Чужое описание' },
    });
    const cancelled = await call(app, 'post', `${invoiceUrl(invoice.id)}/cancel`, {
      token: studentToken,
    });

    expect(patched.status).toBe(403);
    expect(cancelled.status).toBe(403);
    expect(await fetchInvoice(invoice.id)).toEqual(invoice);
  });

  it('/my без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/invoices/my')).status).toBe(401);
  });

  it('/my для учётной записи без профиля даёт 404', async () => {
    const response = await call(app, 'get', '/api/invoices/my', { token: studentToken });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Профиль студента не найден');
  });

  it('студент читает только свои счета: /my и по идентификатору', async () => {
    const owner = await createLoginUser(pool, { role: 'student' });
    const ownerToken = await loginForToken(app, owner);
    const mine = await newInvoice({}, await newContract('active', owner.id));
    const foreign = await newInvoice();

    const list = await call(app, 'get', '/api/invoices/my', { token: ownerToken });
    const own = await call(app, 'get', invoiceUrl(mine.id), { token: ownerToken });
    const other = await call(app, 'get', invoiceUrl(foreign.id), { token: ownerToken });

    expect(list.status).toBe(200);
    expect((list.body.data as InvoiceBody[]).map((item) => item.id)).toEqual([mine.id]);
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(mine.id);
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Счёт не найден');
  });
});

describe('выставление счетов (POST)', () => {
  it('возвращает счёт в формате camelCase: unpaid, остаток равен сумме, не просрочен', async () => {
    const contractId = await newContract();

    const response = await postInvoice(invoicePayload(contractId));

    expect(response.status).toBe(201);
    const created = response.body.data as InvoiceBody;
    expect(Object.keys(created).sort()).toEqual([
      'amount',
      'contractId',
      'createdAt',
      'description',
      'dueDate',
      'id',
      'invoiceNumber',
      'isOverdue',
      'issueDate',
      'paidAmount',
      'remainingAmount',
      'status',
      'updatedAt',
    ]);
    expect(created).toMatchObject({
      contractId,
      description: 'Оплата за сентябрь',
      amount: 2700,
      paidAmount: 0,
      remainingAmount: 2700,
      dueDate: '2099-01-01',
      status: 'unpaid',
      isOverdue: false,
    });
    expect(created.invoiceNumber).toEqual(expect.any(Number));
  });

  it('дата выставления по умолчанию — сегодня (по часам базы данных)', async () => {
    const today = await pool.query<{ today: string }>('SELECT current_date::text AS today');

    const created = await newInvoice();

    expect(created.issueDate).toBe(today.rows[0].today);
  });

  it('принимает явную дату выставления и сумму с копейками', async () => {
    const created = await newInvoice({
      issueDate: '2030-09-01',
      dueDate: '2030-09-10',
      amount: 100.1,
    });

    expect(created).toMatchObject({ issueDate: '2030-09-01', dueDate: '2030-09-10', amount: 100.1 });
  });

  it('номера счетов возрастают', async () => {
    const first = await newInvoice();
    const second = await newInvoice();

    expect(second.invoiceNumber).toBeGreaterThan(first.invoiceNumber);
  });

  it.each<ContractStatus>(['pending', 'terminated', 'expired'])(
    'по договору в статусе %s счёт выставляется',
    async (status) => {
      const created = await newInvoice({}, await newContract(status));

      expect(created.status).toBe('unpaid');
    }
  );

  it('по отменённому договору счёт не выставляется (409)', async () => {
    const response = await postInvoice(invoicePayload(await newContract('cancelled')));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('По отменённому договору счета не выставляются');
  });

  it('несуществующий договор даёт 422', async () => {
    const response = await postInvoice(invoicePayload(randomUUID()));

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ status: 'error', message: 'Договор не найден' });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['нулевая сумма', { amount: 0 }, 'amount'],
    ['отрицательная сумма', { amount: -1 }, 'amount'],
    ['сумма с тремя знаками после запятой', { amount: 10.123 }, 'amount'],
    ['описание из одних пробелов', { description: '   ' }, 'description'],
    ['срок раньше даты выставления', { issueDate: '2099-02-01' }, 'dueDate'],
    ['несуществующая дата', { dueDate: '2099-02-30' }, 'dueDate'],
    ['лишнее поле', { status: 'paid' }, 'status'],
  ])('выставление отклоняет: %s (400)', async (_name, overrides, field) => {
    const contractId = await newContract();

    const response = await postInvoice(invoicePayload(contractId, overrides));

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(field);
    const stored = await pool.query('SELECT 1 FROM invoices WHERE contract_id = $1', [contractId]);
    expect(stored.rowCount).toBe(0);
  });

  it('срок оплаты в прошлом без даты выставления даёт 400 (даёт ограничение базы)', async () => {
    const contractId = await newContract();

    const response = await postInvoice(invoicePayload(contractId, { dueDate: '2020-01-01' }));

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Срок оплаты не может быть раньше даты выставления');
  });
});

describe('чтение счетов (GET)', () => {
  it('список: фильтры по договору и статусу, новые первыми, метаданные', async () => {
    const contractId = await newContract();
    const first = await newInvoice({}, contractId);
    const second = await newInvoice({}, contractId);
    expect((await cancelInvoice(first.id)).status).toBe(200);

    const all = await call(app, 'get', `/api/invoices?contractId=${contractId}`, {
      token: adminToken,
    });
    const cancelled = await call(
      app,
      'get',
      `/api/invoices?contractId=${contractId}&status=cancelled`,
      { token: adminToken }
    );

    expect(all.status).toBe(200);
    expect((all.body.data as InvoiceBody[]).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(all.body.meta).toEqual({ total: 2, limit: 50, offset: 0 });
    expect((cancelled.body.data as InvoiceBody[]).map((item) => item.id)).toEqual([first.id]);
  });

  it('фильтр по студенту и постраничный вывод', async () => {
    const owner = await createLoginUser(pool, { role: 'student' });
    const contractId = await newContract('active', owner.id);
    const studentId = (
      await pool.query<{ student_id: string }>('SELECT student_id FROM contracts WHERE id = $1', [
        contractId,
      ])
    ).rows[0].student_id;
    const first = await newInvoice({}, contractId);
    await newInvoice({}, contractId);

    const page = await call(
      app,
      'get',
      `/api/invoices?studentId=${studentId}&limit=1&offset=1`,
      { token: adminToken }
    );

    expect(page.body.meta).toEqual({ total: 2, limit: 1, offset: 1 });
    expect((page.body.data as InvoiceBody[]).map((item) => item.id)).toEqual([first.id]);
  });

  it('просрочка вычисляется: фильтр ?overdue=true и поле isOverdue', async () => {
    const contractId = await newContract();
    const overdue = await newInvoice(
      { issueDate: '2020-01-01', dueDate: '2020-02-01' },
      contractId
    );
    const future = await newInvoice({}, contractId);

    const response = await call(
      app,
      'get',
      `/api/invoices?contractId=${contractId}&overdue=true`,
      { token: adminToken }
    );

    expect(response.status).toBe(200);
    expect((response.body.data as InvoiceBody[]).map((item) => item.id)).toEqual([overdue.id]);
    expect(overdue.isOverdue).toBe(true);
    expect(future.isOverdue).toBe(false);
  });

  it('отменённый счёт с прошедшим сроком не считается просроченным', async () => {
    const overdue = await newInvoice({ issueDate: '2020-01-01', dueDate: '2020-02-01' });
    expect((await cancelInvoice(overdue.id)).status).toBe(200);

    const after = await fetchInvoice(overdue.id);

    expect(after.status).toBe('cancelled');
    expect(after.isOverdue).toBe(false);
  });

  it.each(['status=overdue', 'overdue=false', 'foo=1', 'limit=0'])(
    'неверный параметр %s даёт 400',
    async (query) => {
      const response = await call(app, 'get', `/api/invoices?${query}`, { token: adminToken });

      expect(response.status).toBe(400);
    }
  );

  it('счёт по идентификатору возвращает те же данные, что при создании', async () => {
    const created = await newInvoice();

    expect(await fetchInvoice(created.id)).toEqual(created);
  });

  it('неизвестный идентификатор даёт 404, некорректный — 400', async () => {
    const unknown = await call(app, 'get', invoiceUrl(randomUUID()), { token: adminToken });
    const invalid = await call(app, 'get', '/api/invoices/not-a-uuid', { token: adminToken });

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ status: 'error', message: 'Счёт не найден' });
    expect(invalid.status).toBe(400);
  });
});

describe('изменение счёта (PATCH)', () => {
  it('меняет описание и срок оплаты, сумма не меняется', async () => {
    const created = await newInvoice();

    const response = await call(app, 'patch', invoiceUrl(created.id), {
      token: adminToken,
      body: { description: 'Новое описание', dueDate: '2099-06-01' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      ...created,
      description: 'Новое описание',
      dueDate: '2099-06-01',
      updatedAt: expect.any(String),
    });
  });

  it('частично оплаченный счёт изменяется', async () => {
    const created = await newInvoice();
    expect((await pay(created.id, 100)).status).toBe(201);

    const response = await call(app, 'patch', invoiceUrl(created.id), {
      token: adminToken,
      body: { description: 'После платежа' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('partially_paid');
  });

  it('оплаченный и отменённый счета не изменяются (409)', async () => {
    const paid = await newInvoice({ amount: 100 });
    expect((await pay(paid.id, 100)).status).toBe(201);
    const cancelled = await newInvoice();
    expect((await cancelInvoice(cancelled.id)).status).toBe(200);

    for (const id of [paid.id, cancelled.id]) {
      const response = await call(app, 'patch', invoiceUrl(id), {
        token: adminToken,
        body: { description: 'Нельзя' },
      });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe(
        'Изменять можно только неоплаченный или частично оплаченный счёт'
      );
    }
  });

  it('срок оплаты раньше даты выставления даёт 400', async () => {
    const created = await newInvoice({ issueDate: '2030-09-01', dueDate: '2030-09-10' });

    const response = await call(app, 'patch', invoiceUrl(created.id), {
      token: adminToken,
      body: { dueDate: '2030-08-01' },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Срок оплаты не может быть раньше даты выставления');
    expect(await fetchInvoice(created.id)).toEqual(created);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['пустой объект', {}, 'тело запроса'],
    ['попытка изменить сумму', { amount: 1 }, 'amount'],
    ['попытка изменить статус', { status: 'paid' }, 'status'],
  ])('PATCH отклоняет: %s (400)', async (_name, body, field) => {
    const created = await newInvoice();

    const response = await call(app, 'patch', invoiceUrl(created.id), { token: adminToken, body });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(field);
    expect(await fetchInvoice(created.id)).toEqual(created);
  });

  it('PATCH неизвестного счёта даёт 404', async () => {
    const response = await call(app, 'patch', invoiceUrl(randomUUID()), {
      token: adminToken,
      body: { description: 'Описание' },
    });

    expect(response.status).toBe(404);
  });
});

describe('отмена счёта', () => {
  it('отменяет неоплаченный счёт', async () => {
    const created = await newInvoice();

    const response = await cancelInvoice(created.id);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: created.id, status: 'cancelled' });
  });

  it('повторная отмена даёт 409', async () => {
    const created = await newInvoice();
    await cancelInvoice(created.id);

    const response = await cancelInvoice(created.id);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Счёт уже отменён');
  });

  it('счёт с платежами не отменяется (409)', async () => {
    const created = await newInvoice();
    expect((await pay(created.id, 100)).status).toBe(201);

    const response = await cancelInvoice(created.id);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Нельзя отменить счёт: по нему есть платежи');
    expect((await fetchInvoice(created.id)).status).toBe('partially_paid');
  });

  it('отмена неизвестного счёта даёт 404', async () => {
    expect((await cancelInvoice(randomUUID())).status).toBe(404);
  });
});

describe('журнал аудита', () => {
  it('выставление записывает автора, адрес клиента и данные счёта', async () => {
    const contractId = await newContract();

    const response = await postInvoice(
      invoicePayload(contractId, { issueDate: '2030-09-01', dueDate: '2030-09-10' }),
      '10.20.30.90'
    );

    expect(response.status).toBe(201);
    const rows = await auditFor(response.body.data.id as string);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: admin.id,
      action: 'create_invoice',
      entity_type: 'invoices',
      ip: '10.20.30.90',
    });
    expect(rows[0].details.after).toEqual({
      contractId,
      description: 'Оплата за сентябрь',
      amount: 2700,
      issueDate: '2030-09-01',
      dueDate: '2030-09-10',
      status: 'unpaid',
    });
  });

  it('изменение и отмена записываются со значениями до и после', async () => {
    const created = await newInvoice({ issueDate: '2030-09-01', dueDate: '2030-09-10' });

    await call(app, 'patch', invoiceUrl(created.id), {
      token: adminToken,
      body: { dueDate: '2030-09-20' },
    });
    await cancelInvoice(created.id);

    const rows = await auditFor(created.id);
    expect(rows.map((row) => row.action)).toEqual([
      'create_invoice',
      'update_invoice',
      'cancel_invoice',
    ]);
    expect(rows[1].details.before.dueDate).toBe('2030-09-10');
    expect(rows[1].details.after.dueDate).toBe('2030-09-20');
    expect(rows[2].details).toEqual({
      before: { status: 'unpaid' },
      after: { status: 'cancelled' },
    });
  });

  it('отклонённые операции не записывают аудит', async () => {
    const created = await newInvoice();
    await cancelInvoice(created.id);
    const before = await countAudits('cancel_invoice');

    const again = await cancelInvoice(created.id);

    expect(again.status).toBe(409);
    expect(await countAudits('cancel_invoice')).toBe(before);
  });
});