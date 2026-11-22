import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  patchInvoiceSchema,
} from '../../src/validation/invoices.validation.js';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
} from '../../src/validation/payments.validation.js';

const CONTRACT_ID = randomUUID();
const INVOICE_ID = randomUUID();

const VALID_INVOICE = {
  contractId: CONTRACT_ID,
  description: 'Оплата за сентябрь',
  amount: 2700,
  dueDate: '2030-09-10',
};

const invoice = (overrides: Record<string, unknown> = {}) => ({ ...VALID_INVOICE, ...overrides });

const INVALID_INVOICES: Array<[string, Record<string, unknown>]> = [
  ['нулевая сумма', invoice({ amount: 0 })],
  ['отрицательная сумма', invoice({ amount: -1 })],
  ['сумма с тремя знаками после запятой', invoice({ amount: 10.123 })],
  ['сумма строкой', invoice({ amount: '100' })],
  ['сумма больше предела', invoice({ amount: 1_000_001 })],
  ['описание из одних пробелов', invoice({ description: '   ' })],
  ['описание длиннее 500 символов', invoice({ description: 'x'.repeat(501) })],
  ['срок оплаты раньше даты выставления', invoice({ issueDate: '2030-09-20' })],
  ['несуществующая дата', invoice({ dueDate: '2030-02-30' })],
  ['идентификатор договора не UUID', invoice({ contractId: 'abc' })],
  ['лишнее поле', invoice({ status: 'paid' })],
];

describe('createInvoiceSchema', () => {
  it('принимает данные без даты выставления', () => {
    expect(createInvoiceSchema.safeParse(VALID_INVOICE).success).toBe(true);
  });

  it('принимает дату выставления, равную сроку оплаты, и сумму с копейками', () => {
    const body = invoice({ issueDate: '2030-09-10', amount: 100.1 });

    expect(createInvoiceSchema.safeParse(body).success).toBe(true);
  });

  it.each(INVALID_INVOICES)('отклоняет: %s', (_name, body) => {
    expect(createInvoiceSchema.safeParse(body).success).toBe(false);
  });

  it.each(['contractId', 'description', 'amount', 'dueDate'])(
    'отклоняет данные без поля %s',
    (key) => {
      const body: Record<string, unknown> = { ...VALID_INVOICE };
      delete body[key];

      expect(createInvoiceSchema.safeParse(body).success).toBe(false);
    }
  );

  it('ошибку сроков относит к полю dueDate', () => {
    const result = createInvoiceSchema.safeParse(invoice({ issueDate: '2030-09-20' }));

    expect(JSON.stringify(result.error?.issues)).toContain('dueDate');
  });

  it('обрезает пробелы по краям описания', () => {
    const result = createInvoiceSchema.safeParse(invoice({ description: '  Оплата  ' }));

    expect(result.data?.description).toBe('Оплата');
  });
});

describe('patchInvoiceSchema', () => {
  it('принимает одно поле', () => {
    expect(patchInvoiceSchema.safeParse({ description: 'Новое описание' }).success).toBe(true);
    expect(patchInvoiceSchema.safeParse({ dueDate: '2030-10-10' }).success).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ['пустой объект', {}],
    ['попытка изменить сумму', { amount: 1 }],
    ['попытка изменить статус', { status: 'paid' }],
    ['попытка изменить договор', { contractId: CONTRACT_ID }],
    ['некорректная дата', { dueDate: '2030-02-30' }],
  ])('отклоняет: %s', (_name, body) => {
    expect(patchInvoiceSchema.safeParse(body).success).toBe(false);
  });
});

describe('listInvoicesQuerySchema', () => {
  it('без параметров: limit 50, offset 0', () => {
    expect(listInvoicesQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it('overdue=true становится логическим значением', () => {
    expect(listInvoicesQuerySchema.parse({ overdue: 'true' }).overdue).toBe(true);
  });

  it('принимает фильтры и приводит строки к числам', () => {
    const parsed = listInvoicesQuerySchema.parse({
      contractId: CONTRACT_ID.toUpperCase(),
      status: 'unpaid',
      limit: '5',
    });

    expect(parsed).toMatchObject({ contractId: CONTRACT_ID, status: 'unpaid', limit: 5 });
  });

  it.each<[string, Record<string, unknown>]>([
    ['overdue=false', { overdue: 'false' }],
    ['неизвестный статус', { status: 'overdue' }],
    ['limit 0', { limit: '0' }],
    ['неизвестный параметр', { foo: '1' }],
  ])('отклоняет: %s', (_name, query) => {
    expect(listInvoicesQuerySchema.safeParse(query).success).toBe(false);
  });
});

const VALID_PAYMENT = { invoiceId: INVOICE_ID, amount: 1000, method: 'cash' };
const payment = (overrides: Record<string, unknown> = {}) => ({ ...VALID_PAYMENT, ...overrides });

describe('createPaymentSchema', () => {
  it('принимает данные без номера платёжного документа', () => {
    expect(createPaymentSchema.safeParse(VALID_PAYMENT).success).toBe(true);
  });

  it.each(['cash', 'card', 'bank_transfer'])('принимает способ оплаты %s', (method) => {
    expect(createPaymentSchema.safeParse(payment({ method })).success).toBe(true);
  });

  it('номер платёжного документа можно передать как null', () => {
    expect(createPaymentSchema.safeParse(payment({ reference: null })).success).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ['нулевая сумма', { amount: 0 }],
    ['отрицательная сумма', { amount: -5 }],
    ['сумма с тремя знаками после запятой', { amount: 1.005 }],
    ['неизвестный способ оплаты', { method: 'crypto' }],
    ['номер документа из одних пробелов', { reference: '  ' }],
    ['идентификатор счёта не UUID', { invoiceId: 'abc' }],
    ['лишнее поле', { status: 'paid' }],
  ])('отклоняет: %s', (_name, overrides) => {
    expect(createPaymentSchema.safeParse(payment(overrides)).success).toBe(false);
  });
});

describe('listPaymentsQuerySchema', () => {
  it('без параметров: limit 50, offset 0', () => {
    expect(listPaymentsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it('приводит invoiceId к нижнему регистру', () => {
    const parsed = listPaymentsQuerySchema.parse({ invoiceId: INVOICE_ID.toUpperCase() });

    expect(parsed.invoiceId).toBe(INVOICE_ID);
  });

  it('отклоняет неизвестный параметр и некорректный invoiceId', () => {
    expect(listPaymentsQuerySchema.safeParse({ foo: '1' }).success).toBe(false);
    expect(listPaymentsQuerySchema.safeParse({ invoiceId: 'abc' }).success).toBe(false);
  });
});