/**
 * Схемы проверки данных договоров.
 *
 * Студент и койка задаются только при создании. PATCH меняет лишь даты и ставку
 * (лишние поля запрещены). Периоды — полуинтервалы [начало, конец).
 */

import { z } from 'zod';

/** Технические границы дат против опечаток; это не бизнес-правила */
const MIN_DATE = '2000-01-01';
const MAX_DATE = '2100-12-31';
const MAX_MONTHLY_RATE = 1_000_000;

/** Строка ГГГГ-ММ-ДД, обозначающая существующую календарную дату */
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Не более двух знаков после запятой (устойчиво к погрешности чисел с плавающей точкой) */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** В PATCH должно быть указано хотя бы одно поле */
function hasValue(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

const uuid = z.uuid().transform((value) => value.toLowerCase());
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate)
  .refine((value) => value >= MIN_DATE && value <= MAX_DATE);
const monthlyRate = z.number().min(0).max(MAX_MONTHLY_RATE).refine(hasAtMostTwoDecimals);

export const contractStatusSchema = z.enum([
  'pending',
  'active',
  'terminated',
  'expired',
  'cancelled',
]);

/** POST /api/contracts. Ставка по умолчанию берётся из здания */
export const createContractSchema = z
  .strictObject({
    studentId: uuid,
    bedId: uuid,
    startDate: date,
    endDate: date,
    monthlyRate: monthlyRate.optional(),
  })
  .refine((value) => value.endDate > value.startDate, { path: ['endDate'] });

/** PATCH /api/contracts/:id — только даты и ставка */
export const patchContractSchema = z
  .strictObject({
    startDate: date.optional(),
    endDate: date.optional(),
    monthlyRate: monthlyRate.optional(),
  })
  .refine(hasValue);

/** POST /api/contracts/:id/terminate — причина необязательна */
export const terminateContractSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500).optional(),
});

/** GET /api/contracts: фильтры и постраничный вывод */
export const listContractsQuerySchema = z.strictObject({
  studentId: uuid.optional(),
  bedId: uuid.optional(),
  status: contractStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export type CreateContractInput = z.output<typeof createContractSchema>;
export type PatchContractInput = z.output<typeof patchContractSchema>;
export type TerminateContractInput = z.output<typeof terminateContractSchema>;
export type ListContractsQuery = z.output<typeof listContractsQuerySchema>;