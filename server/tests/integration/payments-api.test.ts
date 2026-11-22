import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PaymentsService } from '../../src/services/payments.service.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { captureDbError } from '../setup/capture.js';
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
const service = new PaymentsService(pool);

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface InvoiceBody {
  id: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  isOverdue: boolean;
}

interface PaymentBody {
  id: string;
  invoiceId: string;
  amount: number;
  paidAt: string;
  method: string;
  reference: string | null;
  recordedBy: string;
  createdAt: string;
}

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

async function newInvoice(
  amount = 1000,
  overrides: Record<string, unknown> = {},
  contractId?: string
): Promise<InvoiceBody> {
  const response = await call(app, 'post', '/api/invoices', {
    token: adminToken,
    body: {
      contractId: contractId ?? (await newContract()),
      description: 'Оплата',
      amount,
      dueDate: '2099-01-01',
      ...overrides,
    },
  });
  expect(response.status).toBe(201);
  return response.body.data as InvoiceBody;
}

const payBody = (invoiceId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  invoiceId,
  amount,
  method: 'cash',
  ...extra,
});

const postPayment = (body: object, ip?: string) =>
  call(app, 'post', '/api/payments', { token: adminToken, body, ip });

const pay = (invoiceId: string, amount: number, extra: Record<string, unknown> = {}) =>
  postPayment(payBody(invoiceId, amount, extra));

async function payOk(invoiceId: string, amount: number): Promise<PaymentBody> {
  const response = await pay(invoiceId, amount);
  expect(response.status).toBe(201);
  return response.body.data as PaymentBody;
}

async function fetchInvoice(id: string): Promise<InvoiceBody> {
  const response = await call(app, 'get', `/api/invoices/${id}`, { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as InvoiceBody;
}

async function countPayments(invoiceId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) AS count FROM payments WHERE invoice_id = $1',
    [invoiceId]
  );
  return Number(result.rows[0].count);
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
  it('список платежей без токена даёт 401', async () => {
    expect((await call(app, 'get', '/api/payments')).status).toBe(401);
  });

  it('студент не может читать общий список и платёж по идентификатору (403)', async () => {
    const list = await call(app, 'get', '/api/payments', { token: studentToken });
    const one = await call(app, 'get', `/api/payments/${randomUUID()}`, { token: studentToken });

    expect(list.status).toBe(403);
    expect(one.status).toBe(403);
  });

  it('студент не может записывать платёж (403)', async () => {
    const invoice = await newInvoice();

    const response = await call(app, 'post', '/api/payments', {
      token: studentToken,
      body: payBody(invoice.id, 100),
    });

    expect(response.status).toBe(403);
    expect(await countPayments(invoice.id)).toBe(0);
  });

  it('/my без токена даёт 401, без профиля — 404', async () => {
    const anonymous = await call(app, 'get', '/api/payments/my');
    const noProfile = await call(app, 'get', '/api/payments/my', { token: studentToken });

    expect(anonymous.status).toBe(401);
    expect(noProfile.status).toBe(404);
    expect(noProfile.body.message).toBe('Профиль студента не найден');
  });

  it('студент читает только свои платежи', async () => {
    const owner = await createLoginUser(pool, { role: 'student' });
    const ownerToken = await loginForToken(app, owner);
    const mineInvoice = await newInvoice(1000, {}, await newContract('active', owner.id));
    const mine = await payOk(mineInvoice.id, 300);
    await payOk((await newInvoice()).id, 300);

    const response = await call(app, 'get', '/api/payments/my', { token: ownerToken });

    expect(response.status).toBe(200);
    expect((response.body.data as PaymentBody[]).map((item) => item.id)).toEqual([mine.id]);
  });
});

describe('запись платежей (POST)', () => {
  it('платёж на всю сумму: счёт становится paid, остаток равен нулю', async () => {
    const invoice = await newInvoice(1000);

    const response = await pay(invoice.id, 1000);

    expect(response.status).toBe(201);
    const payment = response.body.data as PaymentBody;
    expect(Object.keys(payment).sort()).toEqual([
      'amount',
      'createdAt',
      'id',
      'invoiceId',
      'method',
      'paidAt',
      'recordedBy',
      'reference',
    ]);
    expect(payment).toMatchObject({
      invoiceId: invoice.id,
      amount: 1000,
      method: 'cash',
      reference: null,
      recordedBy: admin.id,
    });
    expect(await fetchInvoice(invoice.id)).toMatchObject({
      status: 'paid',
      paidAmount: 1000,
      remainingAmount: 0,
    });
  });

  it('частичный платёж, затем остаток: partially_paid, потом paid', async () => {
    const invoice = await newInvoice(1000);

    await payOk(invoice.id, 400);
    const partial = await fetchInvoice(invoice.id);
    await payOk(invoice.id, 600);
    const full = await fetchInvoice(invoice.id);

    expect(partial).toMatchObject({ status: 'partially_paid', paidAmount: 400, remainingAmount: 600 });
    expect(full).toMatchObject({ status: 'paid', paidAmount: 1000, remainingAmount: 0 });
  });

  it('сохраняет способ оплаты и номер платёжного документа', async () => {
    const invoice = await newInvoice();

    const response = await pay(invoice.id, 100, { method: 'bank_transfer', reference: ' ПП-123 ' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ method: 'bank_transfer', reference: 'ПП-123' });
  });

  it.each(['cash', 'card', 'bank_transfer'])('принимает способ оплаты %s', async (method) => {
    const invoice = await newInvoice();

    const response = await pay(invoice.id, 100, { method });

    expect(response.status).toBe(201);
    expect(response.body.data.method).toBe(method);
  });

  it('суммы считаются в копейках: три платежа по 0,10 закрывают счёт на 0,30', async () => {
    const invoice = await newInvoice(0.3);

    await payOk(invoice.id, 0.1);
    await payOk(invoice.id, 0.1);
    expect((await fetchInvoice(invoice.id)).status).toBe('partially_paid');
    await payOk(invoice.id, 0.1);

    expect(await fetchInvoice(invoice.id)).toMatchObject({
      status: 'paid',
      paidAmount: 0.3,
      remainingAmount: 0,
    });
  });

  it('превышение остатка даёт 409 с указанием остатка, платёж не сохраняется', async () => {
    const invoice = await newInvoice(1000);
    await payOk(invoice.id, 400);

    const response = await pay(invoice.id, 700);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Сумма платежа превышает остаток по счёту (600.00)');
    expect(await countPayments(invoice.id)).toBe(1);
    expect((await fetchInvoice(invoice.id)).status).toBe('partially_paid');
  });

  it('платёж по оплаченному счёту даёт 409', async () => {
    const invoice = await newInvoice(100);
    await payOk(invoice.id, 100);

    const response = await pay(invoice.id, 1);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Счёт уже оплачен полностью');
  });

  it('платёж по отменённому счёту даёт 409', async () => {
    const invoice = await newInvoice();
    await call(app, 'post', `/api/invoices/${invoice.id}/cancel`, { token: adminToken });

    const response = await pay(invoice.id, 100);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Счёт отменён: платёж принять нельзя');
    expect(await countPayments(invoice.id)).toBe(0);
  });

  it('несуществующий счёт даёт 422', async () => {
    const response = await pay(randomUUID(), 100);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ status: 'error', message: 'Счёт не найден' });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['нулевая сумма', { amount: 0 }, 'amount'],
    ['отрицательная сумма', { amount: -5 }, 'amount'],
    ['сумма с тремя знаками после запятой', { amount: 1.005 }, 'amount'],
    ['неизвестный способ оплаты', { method: 'crypto' }, 'method'],
    ['номер документа из одних пробелов', { reference: '  ' }, 'reference'],
    ['лишнее поле', { status: 'paid' }, 'status'],
    ['идентификатор счёта не UUID', { invoiceId: 'abc' }, 'invoiceId'],
  ])('запись отклоняет: %s (400)', async (_name, overrides, field) => {
    const invoice = await newInvoice();

    const response = await postPayment({ ...payBody(invoice.id, 100), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(field);
    expect(await countPayments(invoice.id)).toBe(0);
  });

  it('просрочка исчезает после полной оплаты, но остаётся при частичной', async () => {
    const invoice = await newInvoice(1000, { issueDate: '2020-01-01', dueDate: '2020-02-01' });
    expect(invoice.isOverdue).toBe(true);

    await payOk(invoice.id, 400);
    const partial = await fetchInvoice(invoice.id);
    await payOk(invoice.id, 600);
    const full = await fetchInvoice(invoice.id);

    expect(partial.isOverdue).toBe(true);
    expect(full.isOverdue).toBe(false);
  });
});

describe('неизменяемость платежей', () => {
  it.each(['put', 'patch', 'delete'] as const)(
    'метод %s для платежа недоступен: маршрута нет, платёж не меняется',
    async (method) => {
      const invoice = await newInvoice();
      const payment = await payOk(invoice.id, 100);

      const response = await call(app, method, `/api/payments/${payment.id}`, {
        token: adminToken,
        body: method === 'delete' ? undefined : { amount: 1 },
      });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Маршрут не найден');
      const check = await call(app, 'get', `/api/payments/${payment.id}`, { token: adminToken });
      expect(check.body.data).toEqual(payment);
    }
  );
});

describe('чтение платежей (GET)', () => {
  it('список по счёту: новые первыми, метаданные', async () => {
    const invoice = await newInvoice(1000);
    const first = await payOk(invoice.id, 100);
    const second = await payOk(invoice.id, 200);

    const response = await call(app, 'get', `/api/payments?invoiceId=${invoice.id}`, {
      token: adminToken,
    });

    expect(response.status).toBe(200);
    expect((response.body.data as PaymentBody[]).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(response.body.meta).toEqual({ total: 2, limit: 50, offset: 0 });
  });

  it('постраничный вывод', async () => {
    const invoice = await newInvoice(1000);
    const first = await payOk(invoice.id, 100);
    await payOk(invoice.id, 200);

    const response = await call(
      app,
      'get',
      `/api/payments?invoiceId=${invoice.id}&limit=1&offset=1`,
      { token: adminToken }
    );

    expect(response.body.meta).toEqual({ total: 2, limit: 1, offset: 1 });
    expect((response.body.data as PaymentBody[]).map((item) => item.id)).toEqual([first.id]);
  });

  it('платёж по идентификатору', async () => {
    const payment = await payOk((await newInvoice()).id, 100);

    const response = await call(app, 'get', `/api/payments/${payment.id}`, { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(payment);
  });

  it('неизвестный идентификатор даёт 404, некорректный — 400', async () => {
    const unknown = await call(app, 'get', `/api/payments/${randomUUID()}`, { token: adminToken });
    const invalid = await call(app, 'get', '/api/payments/not-a-uuid', { token: adminToken });

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ status: 'error', message: 'Платёж не найден' });
    expect(invalid.status).toBe(400);
  });

  it.each(['foo=1', 'invoiceId=abc', 'limit=201'])('неверный параметр %s даёт 400', async (query) => {
    const response = await call(app, 'get', `/api/payments?${query}`, { token: adminToken });

    expect(response.status).toBe(400);
  });
});

describe('журнал аудита и откат', () => {
  it('платёж записывает автора, адрес клиента, суммы и статусы счёта до и после', async () => {
    const invoice = await newInvoice(1000);

    const response = await postPayment(
      payBody(invoice.id, 400, { method: 'card', reference: 'Чек 7' }),
      '10.20.30.91'
    );

    expect(response.status).toBe(201);
    const rows = await auditFor(response.body.data.id as string);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: admin.id,
      action: 'create_payment',
      entity_type: 'payments',
      ip: '10.20.30.91',
    });
    expect(rows[0].details).toEqual({
      invoiceId: invoice.id,
      amount: 400,
      method: 'card',
      reference: 'Чек 7',
      statusBefore: 'unpaid',
      statusAfter: 'partially_paid',
    });
  });

  it('отклонённый платёж не записывает аудит', async () => {
    const invoice = await newInvoice(100);
    const before = await countAudits('create_payment');

    const response = await pay(invoice.id, 200);

    expect(response.status).toBe(409);
    expect(await countAudits('create_payment')).toBe(before);
  });

  it('ошибка записи аудита откатывает и платёж, и смену статуса счёта', async () => {
    const invoice = await newInvoice(1000);

    // Некорректный IP-адрес ломает запись аудита уже после вставки платежа
    // и обновления статуса счёта
    const error = await captureDbError(
      service.create(
        { invoiceId: invoice.id, amount: 400, method: 'cash' },
        { userId: admin.id, ip: 'not-an-ip' }
      )
    );

    expect(error.code).toBe('22P02');
    expect(await countPayments(invoice.id)).toBe(0);
    expect(await fetchInvoice(invoice.id)).toMatchObject({ status: 'unpaid', paidAmount: 0 });
  });
});

describe('параллельные операции', () => {
  it('два одновременных платежа на всю сумму: один принимается, другой получает 409', async () => {
    for (let round = 0; round < 3; round++) {
      const invoice = await newInvoice(1000);

      const responses = await Promise.all([pay(invoice.id, 1000), pay(invoice.id, 1000)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await countPayments(invoice.id)).toBe(1);
      expect((await fetchInvoice(invoice.id)).status).toBe('paid');
    }
  });

  it('два одновременных платежа по половине суммы принимаются оба, счёт становится paid', async () => {
    for (let round = 0; round < 3; round++) {
      const invoice = await newInvoice(1000);

      const responses = await Promise.all([pay(invoice.id, 500), pay(invoice.id, 500)]);

      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(await fetchInvoice(invoice.id)).toMatchObject({
        status: 'paid',
        paidAmount: 1000,
        remainingAmount: 0,
      });
    }
  });

  it('одновременные платёж и отмена счёта: проходит ровно одно из двух', async () => {
    for (let round = 0; round < 3; round++) {
      const invoice = await newInvoice(1000);

      const [payment, cancel] = await Promise.all([
        pay(invoice.id, 1000),
        call(app, 'post', `/api/invoices/${invoice.id}/cancel`, { token: adminToken }),
      ]);

      const succeeded = [payment.status < 300, cancel.status < 300].filter(Boolean);
      expect(succeeded).toHaveLength(1);
      const after = await fetchInvoice(invoice.id);
      const paymentCount = await countPayments(invoice.id);
      if (after.status === 'cancelled') {
        expect(paymentCount).toBe(0);
      } else {
        expect(after.status).toBe('paid');
        expect(paymentCount).toBe(1);
      }
    }
  });

  it('платёж ждёт транзакцию, отменяющую счёт, и затем отклоняется (409)', async () => {
    const invoice = await newInvoice(1000);
    const holder = await pool.connect();

    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [invoice.id]);
      await holder.query("UPDATE invoices SET status = 'cancelled' WHERE id = $1", [invoice.id]);

      let finished = false;
      const pending = pay(invoice.id, 100).then((response) => {
        finished = true;
        return response;
      });

      await sleep(600);
      expect(finished, 'платёж должен ждать снятия блокировки счёта').toBe(false);

      await holder.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Счёт отменён: платёж принять нельзя');
      expect(await countPayments(invoice.id)).toBe(0);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
});