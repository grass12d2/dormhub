/**
 * Схемы проверки запросов к журналу аудита.
 * Журнал только читается; даты периода — ГГГГ-ММ-ДД по UTC, обе границы включены.
 */

import { z } from 'zod';
import { BadRequestError } from '../utils/errors.js';
import { dateField, paginationShape, uuidField } from './common.js';

/**
 * Личные действия пользователей (чат, аватар, профиль, вход): в журнале остаются,
 * но в ленту «Недавняя активность» (scope=activity) не попадают.
 */
export const PERSONAL_ACTIONS = [
  'delete_chat_message',
  'update_avatar',
  'delete_avatar',
  'update_profile',
  'change_email',
  'change_password',
  'reset_password',
  'enable_two_factor',
  'disable_two_factor',
] as const;

/** GET /api/audit-logs: фильтры и постраничный вывод */
export const listAuditLogsQuerySchema = z
  .strictObject({
    actorUserId: uuidField.optional(),
    action: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(100).optional(),
    entityId: uuidField.optional(),
    from: dateField.optional(),
    to: dateField.optional(),
    /** activity — без личных действий (PERSONAL_ACTIONS) */
    scope: z.enum(['all', 'activity']).optional(),
    ...paginationShape,
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.to >= value.from, {
    path: ['to'],
  });

/** Идентификатор записи: положительное целое не длиннее 18 цифр (помещается в bigint) */
export const auditLogIdSchema = z.string().regex(/^[1-9]\d{0,17}$/);

export type ListAuditLogsQuery = z.output<typeof listAuditLogsQuerySchema>;

/** Проверить идентификатор записи; при ошибке — BadRequestError (HTTP 400) */
export function parseAuditLogId(value: unknown): string {
  const result = auditLogIdSchema.safeParse(value);
  if (!result.success) {
    throw new BadRequestError('Некорректный идентификатор');
  }
  return result.data;
}