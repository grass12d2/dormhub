/**
 * Схемы проверки данных комнат.
 *
 * Для POST и PUT используются полные схемы (PUT полностью заменяет запись),
 * для PATCH — частичные, где обязательно хотя бы одно поле.
 * Лишние поля запрещены.
 *
 * Соответствие этажа числу этажей здания и формат номера зависят от здания,
 * поэтому проверяются в сервисе внутри транзакции.
 */

import { z } from 'zod';

/** Технический предел против опечаток; это не бизнес-правило */
const MAX_FLOOR = 100;

/** Идентификатор приводится к нижнему регистру, как его хранит PostgreSQL */
const buildingId = z.uuid().transform((value) => value.toLowerCase());
const roomNumber = z.string().trim().min(1).max(20);
/** Жилые комнаты есть только со второго этажа */
const floor = z.number().int().min(2).max(MAX_FLOOR);
const capacity = z.number().int().min(2).max(4);

/** В PATCH должно быть указано хотя бы одно поле */
function hasValue(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

/** POST /api/rooms */
export const createRoomSchema = z.strictObject({ buildingId, roomNumber, floor, capacity });

/** PUT /api/rooms/:id — полная замена */
export const replaceRoomSchema = createRoomSchema;

/** PATCH /api/rooms/:id — только переданные поля */
export const patchRoomSchema = z
  .strictObject({
    buildingId: buildingId.optional(),
    roomNumber: roomNumber.optional(),
    floor: floor.optional(),
    capacity: capacity.optional(),
  })
  .refine(hasValue);

/** GET /api/rooms: необязательный фильтр по зданию */
export const listRoomsQuerySchema = z.strictObject({ buildingId: buildingId.optional() });

export type CreateRoomInput = z.output<typeof createRoomSchema>;
export type PatchRoomInput = z.output<typeof patchRoomSchema>;