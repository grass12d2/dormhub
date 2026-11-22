import { describe, expect, it } from 'vitest';
import { formatCents, toCents } from '../../src/utils/money.js';

describe('toCents', () => {
  it.each<[number | string, number]>([
    ['700.00', 70000],
    ['0', 0],
    [0.07, 7],
    [0.1, 10],
    [100.1, 10010],
    [1_000_000, 100_000_000],
    ['0.30', 30],
  ])('%s даёт %i копеек', (value, cents) => {
    expect(toCents(value)).toBe(cents);
  });

  it('сумма трёх платежей по 0,10 равна 0,30 копеек без погрешности', () => {
    expect(toCents(0.1) * 3).toBe(toCents(0.3));
    expect(0.1 * 3 === 0.3).toBe(false);
  });
});

describe('formatCents', () => {
  it.each<[number, string]>([
    [60000, '600.00'],
    [5, '0.05'],
    [0, '0.00'],
    [10010, '100.10'],
  ])('%i копеек: «%s»', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});