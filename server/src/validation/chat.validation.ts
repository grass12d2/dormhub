/** Схемы проверки данных чата */

import { z } from 'zod';

export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;

export const sendMessageSchema = z
  .strictObject({
    /** Простой текст */
    body: z.string().trim().min(1).max(2000).optional(),
    /** Форматированный текст: очищается на сервере */
    bodyHtml: z.string().min(1).max(20000).optional(),
    replyToId: z.number().int().min(1).optional(),
  })
  .refine((v) => v.body !== undefined || v.bodyHtml !== undefined, 'Укажите текст сообщения');

/** Правка сообщения: новый текст (простой или форматированный); ответ и вложения не меняются */
export const editMessageSchema = z
  .strictObject({
    body: z.string().trim().min(1).max(2000).optional(),
    bodyHtml: z.string().min(1).max(20000).optional(),
  })
  .refine((v) => v.body !== undefined || v.bodyHtml !== undefined, 'Укажите текст сообщения');

export const messagesQuerySchema = z.strictObject({
  /** Только сообщения новее этого id (опрос) */
  after: z.coerce.number().int().min(0).optional(),
  /** Только сообщения старше этого id (подгрузка истории) */
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const openDirectSchema = z.strictObject({ userId: z.uuid() });
export const peopleQuerySchema = z.strictObject({ q: z.string().trim().min(1).max(100) });
/** kind = null снимает реакцию */
export const reactionSchema = z.strictObject({ kind: z.enum(REACTIONS).nullable() });
export const blockSchema = z.strictObject({ userId: z.uuid() });

export type MessagesQuery = z.infer<typeof messagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;