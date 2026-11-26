import { describe, expect, it } from 'vitest';
import type { Invoice } from '../src/api/invoices';
import { contractMonths, contractNumber, invoiceTotals, monthsLabel } from '../src/lib/contractInfo';
import { paymentQrPayload } from '../src/lib/payment';

const invoice = (patch: Partial<Invoice>): Invoice => ({
  id: 'i',
  invoiceNumber: 1,
  contractId: 'c1',
  description: 'Проживание',
  amount: 0,
  paidAmount: 0,
  remainingAmount: 0,
  issueDate: '2026-09-01',
  dueDate: '2026-09-10',
  status: 'unpaid',
  isOverdue: false,
  ...patch,
});

describe('сведения о договоре', () => {
  it('номер — первые 8 знаков идентификатора', () => {
    expect(contractNumber('3f2a9c1e-77b0-4d1a-9e2f-000000000000')).toBe('3F2A9C1E');
  });

  it('длительность в месяцах', () => {
    expect(contractMonths('2025-09-01', '2026-06-30')).toBe(10);
    expect(contractMonths('2026-01-01', '2026-01-31')).toBe(1);
    expect(contractMonths('2026-01-01', '2026-01-05')).toBe(1);
    expect(contractMonths('2026-02-01', '2026-01-01')).toBe(0);
    expect(contractMonths('нет', '2026-01-01')).toBe(0);
  });

  it('склонение «месяц»', () => {
    expect(monthsLabel(1)).toBe('1 месяц');
    expect(monthsLabel(3)).toBe('3 месяца');
    expect(monthsLabel(10)).toBe('10 месяцев');
    expect(monthsLabel(11)).toBe('11 месяцев');
    expect(monthsLabel(21)).toBe('21 месяц');
  });

  it('итоги по счетам договора без отменённых и чужих', () => {
    const totals = invoiceTotals(
      [
        invoice({ amount: 5000.1, paidAmount: 5000.1, remainingAmount: 0, status: 'paid' }),
        invoice({ amount: 5000.2, paidAmount: 1000, remainingAmount: 4000.2, status: 'partially_paid', isOverdue: true }),
        invoice({ amount: 9999, remainingAmount: 9999, status: 'cancelled' }),
        invoice({ contractId: 'c2', amount: 7000, remainingAmount: 7000 }),
      ],
      'c1'
    );
    expect(totals).toEqual({ count: 2, amount: 10000.3, paid: 6000.1, remaining: 4000.2, overdue: 1 });
  });
});

describe('платёжный QR', () => {
  it('начинается с ST00012 и содержит реквизиты', () => {
    const payload = paymentQrPayload();
    expect(payload.startsWith('ST00012|')).toBe(true);
    expect(payload).toContain('PersonalAcc=');
    expect(payload).toContain('BIC=');
  });
});
