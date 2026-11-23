import { describe, expect, it } from 'vitest';
import { EMPTY_INVOICE_FORM, parseMoney, validateInvoiceForm, validatePaymentAmount } from '../src/lib/moneyForm';

describe('parseMoney', () => {
  it.each([['700', 700], ['750,5', 750.5], ['0.10', 0.1], ['1000000', 1_000_000]])('«%s» даёт %d', (text, value) => {
    expect(parseMoney(text)).toBe(value);
  });

  it.each(['', '0', '-5', '10.123', 'abc', '1000001'])('«%s» отклоняется', (text) => {
    expect(parseMoney(text)).toBeNull();
  });
});

describe('validateInvoiceForm', () => {
  const valid = { contractId: 'c1', description: 'Оплата', amount: '2700', dueDate: '2030-09-10' };

  it('корректная форма без ошибок, пустая — по всем полям', () => {
    expect(validateInvoiceForm(valid)).toEqual({});
    expect(Object.keys(validateInvoiceForm(EMPTY_INVOICE_FORM)).sort()).toEqual(['amount', 'contractId', 'description', 'dueDate']);
  });
});

describe('validatePaymentAmount', () => {
  it('допускает остаток целиком и меньше, отклоняет больше', () => {
    expect(validatePaymentAmount('1700', 1700)).toBeNull();
    expect(validatePaymentAmount('0,1', 1700)).toBeNull();
    expect(validatePaymentAmount('1700.01', 1700)).toMatch(/превышает/);
    expect(validatePaymentAmount('0', 1700)).not.toBeNull();
  });

  it('сравнение в копейках без погрешности', () => {
    expect(validatePaymentAmount('0.3', 0.30000000000000004)).toBeNull();
  });
});