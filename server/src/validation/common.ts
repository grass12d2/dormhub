/**
 * Общие элементы схем проверки: идентификаторы, даты, суммы, постраничный вывод.
 */

import { z } from 'zod';

/** Технические границы против опечаток; это не бизнес-правила */
const MIN_DATE = '2000-01-01';
const MAX_DATE = '2100-12-31';
export const MAX_MONEY = 1_000_000;

/** Строка ГГГГ-ММ-ДД, обозначающая существующую календарную дату */
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Не более двух знаков после запятой (устойчиво к погрешности чисел с плавающей точкой) */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** UUID приводится к нижнему регистру, как его хранит PostgreSQL */
export const uuidField = z.uuid().transform((value) => value.toLowerCase());

export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate)
  .refine((value) => value >= MIN_DATE && value <= MAX_DATE);

/** Положительная сумма не более двух знаков после запятой */
export const positiveMoney = z.number().positive().max(MAX_MONEY).refine(hasAtMostTwoDecimals);

/** В PATCH должно быть указано хотя бы одно поле */
export function hasValue(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

/** Постраничный вывод: limit по умолчанию 50 (не более 200), offset по умолчанию 0 */
export const paginationShape = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};