/**
 * Типы данных платежей.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer';

export interface PaymentRow {
  id: string;
  invoice_id: string;
  /** numeric приходит строкой, например «700.00» */
  amount: string;
  paid_at: Date;
  method: PaymentMethod;
  reference: string | null;
  recorded_by: string;
  created_at: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paidAt: Date;
  method: PaymentMethod;
  reference: string | null;
  recordedBy: string;
  createdAt: Date;
}

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    paidAt: row.paid_at,
    method: row.method,
    reference: row.reference,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}