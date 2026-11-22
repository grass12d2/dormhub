/**
 * Схемы проверки данных студентов.
 *
 * Для POST и PUT используются полные схемы (PUT полностью заменяет запись:
 * пропущенные необязательные поля становятся null), для PATCH — частичные,
 * где обязательно хотя бы одно поле. Лишние поля запрещены.
 * Связь с учётной записью (userId, account) задаётся только при создании.
 */

import { z } from 'zod';
import { emailSchema } from './auth.validation.js';

const MIN_BIRTH_DATE = '1900-01-01';

/** Строка ГГГГ-ММ-ДД, обозначающая существующую календарную дату */
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Не раньше 1900 года и не в будущем */
function isPlausibleBirthDate(value: string): boolean {
  return value >= MIN_BIRTH_DATE && value <= new Date().toISOString().slice(0, 10);
}

/** Необязательный текст: можно опустить или передать null */
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate)
  .refine(isPlausibleBirthDate);

const fields = {
  /** Ровно семь цифр; хранится как текст, поэтому ведущие нули допустимы */
  studentNumber: z.string().regex(/^\d{7}$/),
  displayName: z.string().trim().min(1).max(200),
  lastName: optionalText(100),
  firstName: optionalText(100),
  middleName: optionalText(100),
  birthDate,
  phone: optionalText(40),
  faculty: optionalText(200),
  groupName: optionalText(50),
  educationLevel: optionalText(100),
  fieldOfStudy: optionalText(200),
  programCode: optionalText(50),
  specialization: optionalText(200),
  studyYear: z.number().int().min(1).max(10).nullable().optional(),
  fundingType: z.enum(['budget', 'paid', 'scholarship']).nullable().optional(),
};

const userId = z
  .uuid()
  .transform((value) => value.toLowerCase())
  .optional();

/** Новая учётная запись студента; требования к паролю проверяет сервис */
const account = z
  .strictObject({ email: emailSchema, password: z.string().min(1).max(128) })
  .optional();

/** В PATCH должно быть указано хотя бы одно поле */
function hasValue(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

/** POST /api/students: либо userId существующей учётной записи, либо account новой */
export const createStudentSchema = z
  .strictObject({ ...fields, userId, account })
  .refine((value) => value.userId === undefined || value.account === undefined, {
    path: ['account'],
  });

/** PUT /api/students/:id — полная замена */
export const replaceStudentSchema = z.strictObject(fields);

/** PATCH /api/students/:id — только переданные поля */
export const patchStudentSchema = replaceStudentSchema.partial().refine(hasValue);

/** GET /api/students: поиск и постраничный вывод */
export const listStudentsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export type CreateStudentInput = z.output<typeof createStudentSchema>;
export type ReplaceStudentInput = z.output<typeof replaceStudentSchema>;
export type PatchStudentInput = z.output<typeof patchStudentSchema>;
export type ListStudentsQuery = z.output<typeof listStudentsQuerySchema>;