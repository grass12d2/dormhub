/** Схемы проверки данных объявлений */

import { z } from 'zod';

const target = z.union([
  z.strictObject({ roomId: z.uuid() }),
  z.strictObject({ buildingId: z.uuid(), floor: z.number().int().min(2).max(100).optional() }),
]);

const fields = {
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  /** Пустой список — объявление для всех */
  targets: z.array(target).max(50),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
};

export const createAnnouncementSchema = z.strictObject(fields);
export const replaceAnnouncementSchema = z.strictObject(fields);

export const listAnnouncementsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AnnouncementTargetInput = z.infer<typeof target>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;