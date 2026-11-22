/**
 * Схемы проверки данных платежей.
 * Платежи неизменяемы, поэтому есть только схемы создания и списка.
 */

import { z } from 'zod';
import { paginationShape, positiveMoney, uuidField } from './common.js';

export const paymentMethodSchema = z.enum(['cash', 'card', 'bank_transfer']);

/** POST /api/payments */
export const createPaymentSchema = z.strictObject({
  invoiceId: uuidField,
  amount: positiveMoney,
  method: paymentMethodSchema,
  reference: z.string().trim().min(1).max(100).nullable().optional(),
});

/** GET /api/payments: фильтр по счёту и постраничный вывод */
export const listPaymentsQuerySchema = z.strictObject({
  invoiceId: uuidField.optional(),
  ...paginationShape,
});

export type CreatePaymentInput = z.output<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.output<typeof listPaymentsQuerySchema>;