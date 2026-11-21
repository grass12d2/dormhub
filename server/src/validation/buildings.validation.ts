/**
 * Схемы проверки данных зданий и сотрудников.
 *
 * Для POST и PUT используются полные схемы (PUT полностью заменяет запись),
 * для PATCH — частичные, где обязательно хотя бы одно поле.
 * Лишние поля запрещены.
 */

import { z } from 'zod';

/** Верхняя граница номера здания: тип smallint в базе данных */
const MAX_BUILDING_NUMBER = 32767;
/** Технические пределы против опечаток; это не бизнес-правила */
const MAX_FLOORS = 100;
const MAX_MONTHLY_RATE = 1_000_000;

/** Не более двух знаков после запятой (устойчиво к погрешности чисел с плавающей точкой) */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** В PATCH должно быть указано хотя бы одно поле */
function hasValue(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

const buildingNumber = z.number().int().min(1).max(MAX_BUILDING_NUMBER);
const address = z.string().trim().min(1).max(500);
const metroStation = z.string().trim().min(1).max(100);
const buildingType = z.enum(['corridor', 'block', 'apartment']);
const floorsCount = z.number().int().min(1).max(MAX_FLOORS);
const monthlyRate = z.number().min(0).max(MAX_MONTHLY_RATE).refine(hasAtMostTwoDecimals);

const jobTitle = z.string().trim().min(1).max(200);
const fullName = z.string().trim().min(1).max(200);
const phone = z.string().trim().min(1).max(40);

/** POST /api/buildings. Станцию метро можно опустить: сохранится null */
export const createBuildingSchema = z.strictObject({
  buildingNumber,
  address,
  metroStation: metroStation.nullable().optional(),
  buildingType,
  floorsCount,
  monthlyRate,
});

/** PUT /api/buildings/:id — полная замена */
export const replaceBuildingSchema = createBuildingSchema;

/** PATCH /api/buildings/:id — только переданные поля */
export const patchBuildingSchema = z
  .strictObject({
    buildingNumber: buildingNumber.optional(),
    address: address.optional(),
    metroStation: metroStation.nullable().optional(),
    buildingType: buildingType.optional(),
    floorsCount: floorsCount.optional(),
    monthlyRate: monthlyRate.optional(),
  })
  .refine(hasValue);

/** POST /api/buildings/:id/staff. Телефон можно опустить: сохранится null */
export const createStaffSchema = z.strictObject({
  jobTitle,
  fullName,
  phone: phone.nullable().optional(),
});

/** PUT /api/buildings/:id/staff/:staffId — полная замена */
export const replaceStaffSchema = createStaffSchema;

/** PATCH /api/buildings/:id/staff/:staffId — только переданные поля */
export const patchStaffSchema = z
  .strictObject({
    jobTitle: jobTitle.optional(),
    fullName: fullName.optional(),
    phone: phone.nullable().optional(),
  })
  .refine(hasValue);

export type CreateBuildingInput = z.output<typeof createBuildingSchema>;
export type PatchBuildingInput = z.output<typeof patchBuildingSchema>;
export type CreateStaffInput = z.output<typeof createStaffSchema>;
export type PatchStaffInput = z.output<typeof patchStaffSchema>;