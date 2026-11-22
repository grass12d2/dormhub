/**
 * Запросы к таблице invoices.
 * Оплаченная сумма и остаток вычисляются при чтении по таблице платежей.
 * Даты приводятся к тексту (ГГГГ-ММ-ДД), чтобы драйвер pg не сдвигал их по часовому поясу.
 */

import type { InvoiceRow, InvoiceStatus } from '../../types/invoices.js';
import type { Queryable } from '../queryable.js';

const SELECT_INVOICE = `
  SELECT i.id, i.invoice_number::text AS invoice_number, i.contract_id, i.description, i.amount,
         COALESCE(p.paid, 0) AS paid_amount,
         i.amount - COALESCE(p.paid, 0) AS remaining_amount,
         i.issue_date::text AS issue_date, i.due_date::text AS due_date, i.status,
         (i.status IN ('unpaid', 'partially_paid') AND i.due_date < current_date) AS is_overdue,
         i.created_at, i.updated_at
  FROM invoices i
  LEFT JOIN LATERAL (SELECT sum(amount) AS paid FROM payments WHERE invoice_id = i.id) p ON true`;

const FILTER = `($1::uuid IS NULL OR i.contract_id = $1::uuid)
  AND ($2::uuid IS NULL OR c.student_id = $2::uuid)
  AND ($3::text IS NULL OR i.status = $3::text)
  AND ($4::boolean IS NOT TRUE
       OR (i.status IN ('unpaid', 'partially_paid') AND i.due_date < current_date))`;

/** Счёт, заблокированный на запись (без вычисляемых полей) */
export interface LockedInvoice {
  id: string;
  amount: string;
  status: InvoiceStatus;
  description: string;
  issue_date: string;
  due_date: string;
}

export interface NewInvoice {
  contractId: string;
  description: string;
  amount: number;
  /** null — сегодняшняя дата базы данных */
  issueDate: string | null;
  dueDate: string;
}

export interface InvoicePage {
  rows: InvoiceRow[];
  total: number;
}

export class InvoiceQueries {
  constructor(private readonly db: Queryable) {}

  async findPage(params: {
    contractId?: string;
    studentId?: string;
    status?: InvoiceStatus;
    overdue?: boolean;
    limit: number;
    offset: number;
  }): Promise<InvoicePage> {
    const filter = [
      params.contractId ?? null,
      params.studentId ?? null,
      params.status ?? null,
      params.overdue ? true : null,
    ];

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM invoices i JOIN contracts c ON c.id = i.contract_id
       WHERE ${FILTER}`,
      filter
    );
    const rows = await this.db.query<InvoiceRow>(
      `${SELECT_INVOICE}
       JOIN contracts c ON c.id = i.contract_id
       WHERE ${FILTER}
       ORDER BY i.invoice_number DESC
       LIMIT $5 OFFSET $6`,
      [...filter, params.limit, params.offset]
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  /** Счета студента, привязанного к учётной записи пользователя */
  async findMine(userId: string): Promise<InvoiceRow[]> {
    const result = await this.db.query<InvoiceRow>(
      `${SELECT_INVOICE}
       JOIN contracts c ON c.id = i.contract_id
       JOIN students s ON s.id = c.student_id
       WHERE s.user_id = $1
       ORDER BY i.invoice_number DESC`,
      [userId]
    );
    return result.rows;
  }

  async findById(id: string): Promise<InvoiceRow | null> {
    const result = await this.db.query<InvoiceRow>(`${SELECT_INVOICE} WHERE i.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  /** Счёт, принадлежащий студенту с этой учётной записью */
  async findByIdForUser(id: string, userId: string): Promise<InvoiceRow | null> {
    const result = await this.db.query<InvoiceRow>(
      `${SELECT_INVOICE}
       JOIN contracts c ON c.id = i.contract_id
       JOIN students s ON s.id = c.student_id
       WHERE i.id = $1 AND s.user_id = $2`,
      [id, userId]
    );
    return result.rows[0] ?? null;
  }

  /** Блокировка строки счёта на запись до конца транзакции */
  async lockForUpdate(id: string): Promise<LockedInvoice | null> {
    const result = await this.db.query<LockedInvoice>(
      `SELECT id, amount, status, description, issue_date::text AS issue_date,
              due_date::text AS due_date
       FROM invoices WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Сумма принятых платежей по счёту («0» без платежей) */
  async paidTotal(invoiceId: string): Promise<string> {
    const result = await this.db.query<{ paid: string }>(
      'SELECT COALESCE(sum(amount), 0)::text AS paid FROM payments WHERE invoice_id = $1',
      [invoiceId]
    );
    return result.rows[0].paid;
  }

  /** Общая блокировка договора: его нельзя отменить, пока оформляется счёт */
  async lockContractForShare(contractId: string): Promise<{ id: string; status: string } | null> {
    const result = await this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM contracts WHERE id = $1 FOR SHARE',
      [contractId]
    );
    return result.rows[0] ?? null;
  }

  /** Возвращает идентификатор нового счёта; статус по умолчанию — unpaid */
  async insert(values: NewInvoice): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO invoices (contract_id, description, amount, issue_date, due_date)
       VALUES ($1, $2, $3, COALESCE($4::date, current_date), $5)
       RETURNING id`,
      [values.contractId, values.description, values.amount, values.issueDate, values.dueDate]
    );
    return result.rows[0].id;
  }

  async updateDetails(id: string, description: string, dueDate: string): Promise<void> {
    await this.db.query('UPDATE invoices SET description = $2, due_date = $3 WHERE id = $1', [
      id,
      description,
      dueDate,
    ]);
  }

  async updateStatus(id: string, status: InvoiceStatus): Promise<void> {
    await this.db.query('UPDATE invoices SET status = $2 WHERE id = $1', [id, status]);
  }
}