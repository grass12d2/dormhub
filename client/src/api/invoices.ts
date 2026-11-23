import { buildQuery, type PageMeta } from './client';
import { api } from './index';

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer';

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
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  reference: string | null;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Не оплачен',
  partially_paid: 'Оплачен частично',
  paid: 'Оплачен',
  cancelled: 'Отменён',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank_transfer: 'Банковский перевод',
};

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

async function page<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<Page<T>> {
  const response = await api.get<T[]>(`${path}${buildQuery(params)}`);
  return {
    items: response.data,
    meta: response.meta ?? { total: response.data.length, limit: Number(params.limit), offset: Number(params.offset) },
  };
}

export const listInvoices = (params: { status: string; overdue: boolean; limit: number; offset: number }) =>
  page<Invoice>('/invoices', { ...params, overdue: params.overdue ? 'true' : undefined });

export const createInvoice = async (input: {
  contractId: string;
  description: string;
  amount: number;
  dueDate: string;
}) => (await api.post<Invoice>('/invoices', input)).data;

export const cancelInvoice = async (id: string) => (await api.post<Invoice>(`/invoices/${id}/cancel`, {})).data;

export const listPayments = (params: { limit: number; offset: number }) => page<Payment>('/payments', params);

export const createPayment = async (input: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
}) => (await api.post<Payment>('/payments', input)).data;