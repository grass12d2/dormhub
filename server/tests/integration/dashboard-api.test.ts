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
  studentToken = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
});

afterAll(async () => {
  await pool.end();
});

interface Summary {
  students: number;
  residents: number;
  freeBeds: number;
  debt: number;
  buildings: Array<{ buildingId: string; buildingNumber: number; beds: number; occupied: number }>;
  finance: { paid: number; outstanding: number; overdueInvoices: number; totalInvoices: number };
}

async function fetchSummary(): Promise<Summary> {
  const response = await call(app, 'get', '/api/dashboard/summary', { token: adminToken });
  expect(response.status).toBe(200);
  return response.body.data as Summary;
}

describe('доступ', () => {
  it('без токена 401', async () => {
    expect((await call(app, 'get', '/api/dashboard/summary')).status).toBe(401);
  });

  it('студент получает 403', async () => {
    const response = await call(app, 'get', '/api/dashboard/summary', { token: studentToken });

    expect(response.status).toBe(403);
  });
});

describe('сводка', () => {
  it('формат ответа: все поля есть, числа конечные', async () => {
    const summary = await fetchSummary();

    expect(Object.keys(summary).sort()).toEqual([
      'buildings',
      'debt',
      'finance',
      'freeBeds',
      'residents',
      'students',
    ]);
    expect(Object.keys(summary.finance).sort()).toEqual([
      'outstanding',
      'overdueInvoices',
      'paid',
      'totalInvoices',
    ]);
    for (const value of [summary.students, summary.residents, summary.freeBeds, summary.debt]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(summary.debt).toBe(summary.finance.outstanding);
  });

  it('добавленные данные меняют показатели на известные величины', async () => {
    const before = await fetchSummary();

    const buildingId = await createBuilding(pool, 10);
    const roomId = await createRoom(pool, buildingId, { roomNumber: '201', floor: 2, capacity: 3 });
    const bedA = await createBed(pool, roomId, 1);
    await createBed(pool, roomId, 2);
    const maintenanceBed = await createBed(pool, roomId, 3);
    await pool.query("UPDATE beds SET status = 'maintenance' WHERE id = $1", [maintenanceBed]);
    const studentId = await createStudent(pool);
    await createStudent(pool);
    const contractId = await createContract(pool, {
      studentId,
      bedId: bedA,
      startDate: '2030-09-01',
      endDate: '2030-12-01',
      createdBy: admin.id,
      status: 'active',
    });
    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoices (contract_id, description, amount, issue_date, due_date)
       VALUES ($1, 'Тест', 1000, '2020-01-01', '2020-02-01') RETURNING id`,
      [contractId]
    );
    await pool.query(
      `INSERT INTO payments (invoice_id, amount, method, recorded_by)
       VALUES ($1, 400, 'cash', $2)`,
      [invoice.rows[0].id, admin.id]
    );
    await pool.query("UPDATE invoices SET status = 'partially_paid' WHERE id = $1", [
      invoice.rows[0].id,
    ]);

    const after = await fetchSummary();

    expect(after.students - before.students).toBe(2);
    expect(after.residents - before.residents).toBe(1);
    // Три койки: одна занята, одна свободна, одна на обслуживании
    expect(after.freeBeds - before.freeBeds).toBe(1);
    expect(after.debt - before.debt).toBe(600);
    expect(after.finance.paid - before.finance.paid).toBe(400);
    expect(after.finance.overdueInvoices - before.finance.overdueInvoices).toBe(1);
    expect(after.finance.totalInvoices - before.finance.totalInvoices).toBe(1);

    const load = after.buildings.find((item) => item.buildingId === buildingId);
    expect(load).toMatchObject({ beds: 3, occupied: 1 });
  });

  it('отменённый счёт не входит в задолженность и в число счетов', async () => {
    const before = await fetchSummary();
    const bedId = await createBed(
      pool,
      await createRoom(pool, await createBuilding(pool, 10), { roomNumber: '201', floor: 2 }),
      1
    );
    const contractId = await createContract(pool, {
      studentId: await createStudent(pool),
      bedId,
      startDate: '2030-09-01',
      endDate: '2030-12-01',
      createdBy: admin.id,
      status: 'active',
    });
    await pool.query(
      `INSERT INTO invoices (contract_id, description, amount, issue_date, due_date, status)
       VALUES ($1, 'Отменён', 5000, '2020-01-01', '2020-02-01', 'cancelled')`,
      [contractId]
    );

    const after = await fetchSummary();

    expect(after.debt).toBe(before.debt);
    expect(after.finance.totalInvoices).toBe(before.finance.totalInvoices);
    expect(after.finance.overdueInvoices).toBe(before.finance.overdueInvoices);
  });

  it('здание без коек показывается с нулями', async () => {
    const buildingId = await createBuilding(pool, 10);

    const summary = await fetchSummary();

    const load = summary.buildings.find((item) => item.buildingId === buildingId);
    expect(load).toMatchObject({ beds: 0, occupied: 0 });
  });
});