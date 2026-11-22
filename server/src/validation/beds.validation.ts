/**
 * Схемы проверки данных коек.
 *
 * Комната задаётся только при создании. PUT и PATCH комнату не принимают
 * (лишние поля запрещены): перенос койки между комнатами мог бы обойти
 * проверку вместимости.
 */

import { z } from 'zod';

const roomId = z.uuid().transform((value) => value.toLowerCase());
/** Технический предел против опечаток; это не бизнес-правило */
const bedNumber = z.number().int().min(1).max(99);
const status = z.enum(['available', 'maintenance']);

/** В PATCH должно быть указано хотя бы одно поле */
function hasValue(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

/** POST /api/beds. Статус по умолчанию — available */
export const createBedSchema = z.strictObject({ roomId, bedNumber, status: status.optional() });

/** PUT /api/beds/:id — полная замена номера и статуса */
export const replaceBedSchema = z.strictObject({ bedNumber, status });

/** PATCH /api/beds/:id — только переданные поля */
export const patchBedSchema = z
  .strictObject({ bedNumber: bedNumber.optional(), status: status.optional() })
  .refine(hasValue);

/** GET /api/beds: необязательный фильтр по комнате */
export const listBedsQuerySchema = z.strictObject({ roomId: roomId.optional() });

export type CreateBedInput = z.output<typeof createBedSchema>;
export type ReplaceBedInput = z.output<typeof replaceBedSchema>;
export type PatchBedInput = z.output<typeof patchBedSchema>;