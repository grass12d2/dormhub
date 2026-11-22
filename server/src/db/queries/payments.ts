/**
 * Запросы к таблице payments.
 * Платежи неизменяемы: есть только чтение и вставка.
 */

import type { PaymentMethod, PaymentRow } from '../../types/payments.js';
import type { Queryable } from '../queryable.js';

const COLUMNS = 'p.id, p.invoice_id, p.amount, p.paid_at, p.method, p.reference, p.recorded_by, p.created_at';

export interface NewPayment {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  recordedBy: string;
}

export interface PaymentPage {
  rows: PaymentRow[];
  total: number;
}

export class PaymentQueries {
  constructor(private readonly db: Queryable) {}

  async findPage(params: { invoiceId?: string; limit: number; offset: number }): Promise<PaymentPage> {
    const filter = [params.invoiceId ?? null];

    const count = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM payments p WHERE ($1::uuid IS NULL OR p.invoice_id = $1::uuid)',
      filter
    );
    const rows = await this.db.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments p
       WHERE ($1::uuid IS NULL OR p.invoice_id = $1::uuid)
       ORDER BY p.paid_at DESC, p.id
       LIMIT $2 OFFSET $3`,
      [...filter, params.limit, params.offset]
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  /** Платежи студента, привязанного к учётной записи пользователя */
  async findMine(userId: string): Promise<PaymentRow[]> {
    const result = await this.db.query<PaymentRow>(
      `SELECT ${COLUMNS}
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN contracts c ON c.id = i.contract_id
       JOIN students s ON s.id = c.student_id
       WHERE s.user_id = $1
       ORDER BY p.paid_at DESC, p.id`,
      [userId]
    );
    return result.rows;
  }

  async findById(id: string): Promise<PaymentRow | null> {
    const result = await this.db.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments p WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async insert(values: NewPayment): Promise<PaymentRow> {
    const result = await this.db.query<PaymentRow>(
      `INSERT INTO payments (invoice_id, amount, method, reference, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, invoice_id, amount, paid_at, method, reference, recorded_by, created_at`,
      [values.invoiceId, values.amount, values.method, values.reference, values.recordedBy]
    );
    return result.rows[0];
  }
}