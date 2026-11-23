/** Схемы проверки данных объявлений */

import { z } from 'zod';

const target = z.union([
  z.strictObject({ roomId: z.uuid() }),
  z.strictObject({ buildingId: z.uuid(), floor: z.number().int().min(2).max(100).optional() }),
]);

const fields = {
  title: z.string().trim().min(1).max(200),
  /** Простой текст (прежний способ) */
  body: z.string().trim().min(1).max(5000).optional(),
  /** Форматированный текст: очищается на сервере */
  bodyHtml: z.string().min(1).max(20000).optional(),
  /** Пустой список — объявление для всех */
  targets: z.array(target).max(50),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
};

/** Нужен хотя бы один из вариантов текста */
const hasBody = (value: { body?: string; bodyHtml?: string }) =>
  value.body !== undefined || value.bodyHtml !== undefined;

export const createAnnouncementSchema = z
  .strictObject(fields)
  .refine(hasBody, 'Укажите текст объявления');
export const replaceAnnouncementSchema = z
  .strictObject(fields)
  .refine(hasBody, 'Укажите текст объявления');

export const listAnnouncementsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AnnouncementTargetInput = z.infer<typeof target>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;