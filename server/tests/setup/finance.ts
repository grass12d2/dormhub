/**
 * Фабрики тестовых данных для счетов, платежей и журнала аудита.
 * Все значения вымышленные.
 */

import type { Db } from './factories.js';

export async function createInvoice(
  db: Db,
  contractId: string,
  amount = '1000.00'
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO invoices (contract_id, description, amount, due_date)
     VALUES ($1, 'Тестовый счёт', $2, current_date + 30)
     RETURNING id`,
    [contractId, amount]
  );
  return result.rows[0].id;
}

export async function createPayment(
  db: Db,
  invoiceId: string,
  recordedBy: string,
  amount = '100.00'
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO payments (invoice_id, amount, method, recorded_by)
     VALUES ($1, $2, 'cash', $3)
     RETURNING id`,
    [invoiceId, amount, recordedBy]
  );
  return result.rows[0].id;
}

/** Запись в журнале аудита; идентификатор bigint возвращается строкой */
export async function createAuditLog(
  db: Db,
  actorUserId: string | null,
  action = 'test_action'
): Promise<string> {
  const result = await db.query<{ id: string }>(
    'INSERT INTO audit_logs (actor_user_id, action) VALUES ($1, $2) RETURNING id',
    [actorUserId, action]
  );
  return result.rows[0].id;
}