/**
 * Схемы проверки данных счетов.
 *
 * Сумма счёта после создания не меняется: PATCH принимает только описание
 * и срок оплаты (лишние поля запрещены).
 */

import { z } from 'zod';
import { dateField, hasValue, paginationShape, positiveMoney, uuidField } from './common.js';

export const invoiceStatusSchema = z.enum(['unpaid', 'partially_paid', 'paid', 'cancelled']);

const description = z.string().trim().min(1).max(500);

/** POST /api/invoices. Дата выставления по умолчанию — сегодня (определяет база) */
export const createInvoiceSchema = z
  .strictObject({
    contractId: uuidField,
    description,
    amount: positiveMoney,
    issueDate: dateField.optional(),
    dueDate: dateField,
  })
  .refine((value) => value.issueDate === undefined || value.dueDate >= value.issueDate, {
    path: ['dueDate'],
  });

/** PATCH /api/invoices/:id — описание и срок оплаты */
export const patchInvoiceSchema = z
  .strictObject({ description: description.optional(), dueDate: dateField.optional() })
  .refine(hasValue);

/** GET /api/invoices: фильтры и постраничный вывод */
export const listInvoicesQuerySchema = z.strictObject({
  contractId: uuidField.optional(),
  studentId: uuidField.optional(),
  status: invoiceStatusSchema.optional(),
  /** Только ?overdue=true: просроченные счета */
  overdue: z
    .literal('true')
    .transform(() => true)
    .optional(),
  ...paginationShape,
});

export type CreateInvoiceInput = z.output<typeof createInvoiceSchema>;
export type PatchInvoiceInput = z.output<typeof patchInvoiceSchema>;
export type ListInvoicesQuery = z.output<typeof listInvoicesQuerySchema>;