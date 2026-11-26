import { describe, expect, it } from 'vitest';
import type { Invoice } from '../src/api/invoices';
import {
  curfewState,
  daysUntil,
  debtSummary,
  durationLabel,
  dutyWeekday,
  isoDate,
  nextDutyDate,
  plural,
} from '../src/lib/studentOverview';

const at = (h: number, m = 0) => new Date(2026, 10, 27, h, m);

describe('studentOverview', () => {
  it('склоняет слова', () => {
    expect([1, 2, 5, 11, 21, 104].map((n) => plural(n, 'день', 'дня', 'дней'))).toEqual([
      'день',
      'дня',
      'дней',
      'дней',
      'день',
      'дня',
    ]);
  });

  it('день дежурства по номеру комнаты', () => {
    expect(dutyWeekday('401')).toBe(0);
    expect(dutyWeekday('412')).toBe(4);
    expect(dutyWeekday('408')).toBe(0);
    expect(dutyWeekday('300')).toBe(6);
    expect(dutyWeekday('12а')).toBe(dutyWeekday('412'));
    expect(dutyWeekday('Б')).toBe(dutyWeekday('Б'));
  });

  it('ближайшее дежурство начиная с сегодня', () => {
    // 27.11.2026 — пятница
    expect(isoDate(nextDutyDate('412', at(10)))).toBe('2026-11-27');
    expect(isoDate(nextDutyDate('401', at(10)))).toBe('2026-11-30');
  });

  it('комендантский час', () => {
    expect(curfewState(at(12))).toEqual({ kind: 'open' });
    expect(curfewState(at(21, 40))).toEqual({ kind: 'soon', minutesLeft: 80 });
    expect(curfewState(at(23, 5))).toEqual({ kind: 'closed' });
    expect(curfewState(at(5, 59))).toEqual({ kind: 'closed' });
    expect(curfewState(at(6))).toEqual({ kind: 'open' });
    expect([80, 45, 120].map(durationLabel)).toEqual(['1 ч 20 мин', '45 мин', '2 ч']);
  });

  it('дни до даты', () => {
    expect(daysUntil('2026-12-27', at(23))).toBe(30);
    expect(daysUntil('2026-11-26', at(1))).toBe(-1);
  });

  it('сводка задолженности', () => {
    const base = { contractId: 'c', description: '', issueDate: '2026-11-01', paidAmount: 0, isOverdue: false };
    const invoices = [
      { ...base, id: '1', invoiceNumber: 1, amount: 100, remainingAmount: 100, dueDate: '2026-12-10', status: 'unpaid' },
      { ...base, id: '2', invoiceNumber: 2, amount: 50.5, remainingAmount: 50.5, dueDate: '2026-11-10', status: 'unpaid', isOverdue: true },
      { ...base, id: '3', invoiceNumber: 3, amount: 70, remainingAmount: 70, dueDate: '2026-10-10', status: 'cancelled' },
      { ...base, id: '4', invoiceNumber: 4, amount: 70, remainingAmount: 0, dueDate: '2026-09-10', status: 'paid' },
    ] as Invoice[];
    const summary = debtSummary(invoices);
    expect(summary.remaining).toBe(150.5);
    expect(summary.next?.id).toBe('2');
    expect(summary.overdue).toBe(1);
  });
});
