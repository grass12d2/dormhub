import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureDbError } from '../setup/capture.js';
import { expectDbError } from '../setup/db-assert.js';
import {
  createBed,
  createBuilding,
  createContract,
  createRoom,
  createStudent,
  createUser,
} from '../setup/factories.js';
import { createAuditLog, createInvoice, createPayment } from '../setup/finance.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

let adminId = '';
let contractId = '';

beforeAll(async () => {
  adminId = await createUser(pool, 'admin');
  const buildingId = await createBuilding(pool);
  const roomId = await createRoom(pool, buildingId);
  const bedId = await createBed(pool, roomId, 1);
  const studentId = await createStudent(pool);
  contractId = await createContract(pool, {
    studentId,
    bedId,
    startDate: '2026-09-01',
    endDate: '2026-12-01',
    createdBy: adminId,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('платежи неизменяемы', () => {
  it('платёж записывается', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    const paymentId = await createPayment(pool, invoiceId, adminId, '250.50');
    const result = await pool.query<{ amount: string }>(
      'SELECT amount FROM payments WHERE id = $1',
      [paymentId]
    );
    expect(result.rows[0].amount).toBe('250.50');
  });

  it('изменение платежа отклоняется, сумма не меняется', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    const paymentId = await createPayment(pool, invoiceId, adminId, '100.00');

    const error = await captureDbError(
      pool.query('UPDATE payments SET amount = 1 WHERE id = $1', [paymentId])
    );
    expect(error.code).toBe('P0001');
    expect(error.message).toMatch(/неизменяем/);
    expect(error.message).toContain('UPDATE');

    const result = await pool.query<{ amount: string }>(
      'SELECT amount FROM payments WHERE id = $1',
      [paymentId]
    );
    expect(result.rows[0].amount).toBe('100.00');
  });

  it('изменение без смены значений тоже отклоняется', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    const paymentId = await createPayment(pool, invoiceId, adminId);

    const error = await captureDbError(
      pool.query('UPDATE payments SET amount = amount WHERE id = $1', [paymentId])
    );
    expect(error.code).toBe('P0001');
  });

  it('удаление платежа отклоняется, запись остаётся', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    const paymentId = await createPayment(pool, invoiceId, adminId);

    const error = await captureDbError(
      pool.query('DELETE FROM payments WHERE id = $1', [paymentId])
    );
    expect(error.code).toBe('P0001');
    expect(error.message).toMatch(/неизменяем/);
    expect(error.message).toContain('DELETE');

    const result = await pool.query('SELECT 1 FROM payments WHERE id = $1', [paymentId]);
    expect(result.rowCount).toBe(1);
  });

  it('TRUNCATE таблицы платежей отклоняется, записи остаются', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    const paymentId = await createPayment(pool, invoiceId, adminId);

    const error = await captureDbError(pool.query('TRUNCATE payments'));
    expect(error.code).toBe('P0001');
    expect(error.message).toMatch(/неизменяем/);
    expect(error.message).toContain('TRUNCATE');

    const result = await pool.query('SELECT 1 FROM payments WHERE id = $1', [paymentId]);
    expect(result.rowCount).toBe(1);
  });

  it.each([0, -5])('отклоняет сумму платежа %i', async (amount) => {
    const invoiceId = await createInvoice(pool, contractId);
    await expectDbError(createPayment(pool, invoiceId, adminId, String(amount)), {
      code: '23514',
      constraint: 'payments_amount_check',
    });
  });

  it('отклоняет неизвестный способ оплаты', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    await expectDbError(
      pool.query(
        "INSERT INTO payments (invoice_id, amount, method, recorded_by) VALUES ($1, 10, 'crypto', $2)",
        [invoiceId, adminId]
      ),
      { code: '23514', constraint: 'payments_method_check' }
    );
  });

  it('отклоняет платёж по несуществующему счёту', async () => {
    await expectDbError(createPayment(pool, randomUUID(), adminId), {
      code: '23503',
      constraint: 'payments_invoice_id_fkey',
    });
  });

  it('нельзя удалить счёт, по которому есть платежи', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    await createPayment(pool, invoiceId, adminId);
    await expectDbError(pool.query('DELETE FROM invoices WHERE id = $1', [invoiceId]), {
      code: '23503',
      constraint: 'payments_invoice_id_fkey',
    });
  });

  it('нельзя удалить пользователя, записавшего платёж', async () => {
    const recorderId = await createUser(pool, 'admin');
    const invoiceId = await createInvoice(pool, contractId);
    await createPayment(pool, invoiceId, recorderId);
    await expectDbError(pool.query('DELETE FROM users WHERE id = $1', [recorderId]), {
      code: '23503',
      constraint: 'payments_recorded_by_fkey',
    });
  });
});

describe('счета', () => {
  it('новый счёт получает статус unpaid', async () => {
    const invoiceId = await createInvoice(pool, contractId);
    const result = await pool.query<{ status: string }>(
      'SELECT status FROM invoices WHERE id = $1',
      [invoiceId]
    );
    expect(result.rows[0].status).toBe('unpaid');
  });

  it('номера счетов автоматические и возрастают', async () => {
    const firstId = await createInvoice(pool, contractId);
    const secondId = await createInvoice(pool, contractId);
    const result = await pool.query<{ id: string; invoice_number: string }>(
      'SELECT id, invoice_number FROM invoices WHERE id = ANY($1::uuid[])',
      [[firstId, secondId]]
    );
    const numbers = new Map(result.rows.map((row) => [row.id, BigInt(row.invoice_number)]));
    expect(numbers.get(secondId)!).toBeGreaterThan(numbers.get(firstId)!);
  });

  it('номер счёта нельзя задать вручную', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO invoices (invoice_number, contract_id, description, amount, due_date)
         VALUES (999999, $1, 'Тест', 10, current_date)`,
        [contractId]
      ),
      { code: '428C9' }
    );
  });

  it('отклоняет нулевую сумму счёта', async () => {
    await expectDbError(createInvoice(pool, contractId, '0'), {
      code: '23514',
      constraint: 'invoices_amount_check',
    });
  });

  it('отклоняет срок оплаты раньше даты выставления', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO invoices (contract_id, description, amount, issue_date, due_date)
         VALUES ($1, 'Тест', 10, '2026-10-10', '2026-10-01')`,
        [contractId]
      ),
      { code: '23514', constraint: 'invoices_dates_check' }
    );
  });

  it('статус просрочки не хранится: статус overdue недопустим', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO invoices (contract_id, description, amount, due_date, status)
         VALUES ($1, 'Тест', 10, current_date, 'overdue')`,
        [contractId]
      ),
      { code: '23514', constraint: 'invoices_status_check' }
    );
  });

  it('нельзя удалить договор, у которого есть счета', async () => {
    await createInvoice(pool, contractId);
    await expectDbError(pool.query('DELETE FROM contracts WHERE id = $1', [contractId]), {
      code: '23503',
      constraint: 'invoices_contract_id_fkey',
    });
  });
});

describe('журнал аудита', () => {
  it('запись добавляется и получает номер и время', async () => {
    const logId = await createAuditLog(pool, adminId, 'create_building');
    const result = await pool.query<{ action: string; created_at: Date }>(
      'SELECT action, created_at FROM audit_logs WHERE id = $1',
      [logId]
    );
    expect(result.rows[0].action).toBe('create_building');
    expect(result.rows[0].created_at).toBeInstanceOf(Date);
  });

  it('изменение записи отклоняется', async () => {
    const logId = await createAuditLog(pool, adminId);
    const error = await captureDbError(
      pool.query("UPDATE audit_logs SET action = 'changed' WHERE id = $1", [logId])
    );
    expect(error.code).toBe('P0001');
    expect(error.message).toMatch(/неизменяем/);
    expect(error.message).toContain('UPDATE');

    const result = await pool.query<{ action: string }>(
      'SELECT action FROM audit_logs WHERE id = $1',
      [logId]
    );
    expect(result.rows[0].action).toBe('test_action');
  });

  it('удаление записи отклоняется', async () => {
    const logId = await createAuditLog(pool, adminId);
    const error = await captureDbError(
      pool.query('DELETE FROM audit_logs WHERE id = $1', [logId])
    );
    expect(error.code).toBe('P0001');
    expect(error.message).toContain('DELETE');

    const result = await pool.query('SELECT 1 FROM audit_logs WHERE id = $1', [logId]);
    expect(result.rowCount).toBe(1);
  });

  it('TRUNCATE журнала отклоняется, записи остаются', async () => {
    const logId = await createAuditLog(pool, adminId);
    const error = await captureDbError(pool.query('TRUNCATE audit_logs'));
    expect(error.code).toBeDefined();

    const result = await pool.query('SELECT 1 FROM audit_logs WHERE id = $1', [logId]);
    expect(result.rowCount).toBe(1);
  });

  it('TRUNCATE журнала возвращает сообщение о неизменяемости', async () => {
    const error = await captureDbError(pool.query('TRUNCATE audit_logs'));
    expect(error.code).toBe('P0001');
    expect(error.message).toMatch(/неизменяем/);
    expect(error.message).toContain('TRUNCATE');
  });

  it('допускается единственное изменение: обнуление автора', async () => {
    const userId = await createUser(pool, 'admin');
    const logId = await createAuditLog(pool, userId, 'some_action');
    const result = await pool.query<{ actor_user_id: string | null; action: string }>(
      'UPDATE audit_logs SET actor_user_id = NULL WHERE id = $1 RETURNING actor_user_id, action',
      [logId]
    );
    expect(result.rows[0].actor_user_id).toBeNull();
    expect(result.rows[0].action).toBe('some_action');
  });

  it('смена автора на другого пользователя отклоняется', async () => {
    const userId = await createUser(pool, 'admin');
    const otherId = await createUser(pool, 'admin');
    const logId = await createAuditLog(pool, userId);
    const error = await captureDbError(
      pool.query('UPDATE audit_logs SET actor_user_id = $2 WHERE id = $1', [logId, otherId])
    );
    expect(error.code).toBe('P0001');
  });

  it('обнуление автора вместе с изменением другого поля отклоняется', async () => {
    const userId = await createUser(pool, 'admin');
    const logId = await createAuditLog(pool, userId, 'original');
    const error = await captureDbError(
      pool.query(
        "UPDATE audit_logs SET actor_user_id = NULL, action = 'changed' WHERE id = $1",
        [logId]
      )
    );
    expect(error.code).toBe('P0001');

    const result = await pool.query<{ actor_user_id: string | null; action: string }>(
      'SELECT actor_user_id, action FROM audit_logs WHERE id = $1',
      [logId]
    );
    expect(result.rows[0]).toEqual({ actor_user_id: userId, action: 'original' });
  });

  it('удаление пользователя обнуляет автора в журнале, записи сохраняются', async () => {
    const userId = await createUser(pool, 'admin');
    const first = await createAuditLog(pool, userId, 'first_action');
    const second = await createAuditLog(pool, userId, 'second_action');

    const deleted = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    expect(deleted.rowCount).toBe(1);

    const logs = await pool.query<{ actor_user_id: string | null; action: string }>(
      `SELECT actor_user_id, action FROM audit_logs
       WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [[first, second]]
    );
    expect(logs.rows).toEqual([
      { actor_user_id: null, action: 'first_action' },
      { actor_user_id: null, action: 'second_action' },
    ]);
  });

  it('отклоняет пустое название действия', async () => {
    await expectDbError(createAuditLog(pool, adminId, '   '), {
      code: '23514',
      constraint: 'audit_logs_action_check',
    });
  });
});