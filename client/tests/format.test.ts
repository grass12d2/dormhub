import { describe, expect, it } from 'vitest';
import { auditLabel } from '../src/lib/audit-labels';
import { formatDateTime, formatNumber, percent } from '../src/lib/format';

describe('percent', () => {
  it('округляет до целого и защищён от деления на ноль', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 5)).toBe(100);
  });
});

describe('форматирование', () => {
  it('число разделяет тысячи', () => {
    expect(formatNumber(3936).replace(/\s/g, ' ')).toBe('3 936');
  });

  it('неверная дата даёт тире', () => {
    expect(formatDateTime('не дата')).toBe('—');
  });
});

describe('auditLabel', () => {
  it('известное действие переводится, неизвестное остаётся как есть', () => {
    expect(auditLabel('create_payment')).toBe('Принят платёж');
    expect(auditLabel('something_new')).toBe('something_new');
  });
});