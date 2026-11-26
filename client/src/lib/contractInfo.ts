import type { Invoice } from '../api/invoices';

const DAY = 24 * 60 * 60 * 1000;

/** Номер договора для показа: первые 8 знаков идентификатора прописными */
export function contractNumber(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Длительность договора в месяцах (по среднему месяцу 30,44 дня), не меньше 1; неверные даты дают 0 */
export function contractMonths(startDate: string, endDate: string): number {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start + DAY) / DAY / 30.44));
}

/** «10 месяцев», «1 месяц», «3 месяца» */
export function monthsLabel(months: number): string {
  const n = Math.abs(months) % 100;
  const last = n % 10;
  const word = n > 10 && n < 20 ? 'месяцев' : last === 1 ? 'месяц' : last >= 2 && last <= 4 ? 'месяца' : 'месяцев';
  return `${months} ${word}`;
}

export interface InvoiceTotals {
  count: number;
  amount: number;
  paid: number;
  remaining: number;
  overdue: number;
}

/** Итоги по счетам одного договора; отменённые счета не учитываются. Суммы считаются в копейках */
export function invoiceTotals(invoices: Invoice[], contractId: string): InvoiceTotals {
  const own = invoices.filter((i) => i.contractId === contractId && i.status !== 'cancelled');
  const sum = (pick: (i: Invoice) => number) => own.reduce((acc, i) => acc + Math.round(pick(i) * 100), 0) / 100;
  return {
    count: own.length,
    amount: sum((i) => i.amount),
    paid: sum((i) => i.paidAmount),
    remaining: sum((i) => i.remainingAmount),
    overdue: own.filter((i) => i.isOverdue).length,
  };
}
