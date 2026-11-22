/**
 * Схемы проверки запросов к журналу аудита.
 * Журнал только читается; даты периода — ГГГГ-ММ-ДД по UTC, обе границы включены.
 */

import { z } from 'zod';
import { BadRequestError } from '../utils/errors.js';
import { dateField, paginationShape, uuidField } from './common.js';

/** GET /api/audit-logs: фильтры и постраничный вывод */
export const listAuditLogsQuerySchema = z
  .strictObject({
    actorUserId: uuidField.optional(),
    action: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(100).optional(),
    entityId: uuidField.optional(),
    from: dateField.optional(),
    to: dateField.optional(),
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