/**
 * Типы данных счетов.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'cancelled';

export interface InvoiceRow {
  id: string;
  /** bigint приходит строкой */
  invoice_number: string;
  contract_id: string;
  description: string;
  /** numeric приходит строкой, например «700.00» */
  amount: string;
  paid_amount: string;
  remaining_amount: string;
  /** Строки ГГГГ-ММ-ДД: в SQL даты приведены к тексту, чтобы избежать сдвига часового пояса */
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  /** Не хранится: вычисляется при чтении по сроку оплаты и состоянию платежей */
  is_overdue: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Invoice {
  id: string;
  invoiceNumber: number;
  contractId: string;
  description: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  isOverdue: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoiceNumber: Number(row.invoice_number),
    contractId: row.contract_id,
    description: row.description,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    remainingAmount: Number(row.remaining_amount),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    isOverdue: row.is_overdue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}