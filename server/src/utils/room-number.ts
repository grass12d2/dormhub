/**
 * Формат номера комнаты по типу здания и этажу.
 *
 *  - corridor, apartment: этаж и две цифры номера (201, 1001);
 *  - block: «этаж-блок-комната» (7-3-2) или слитно «этаж, блок, комната» (643),
 *    где блок и комната — по одной цифре.
 *
 * Число комнат на этаже и число блоков здесь не проверяются.
 */

import type { BuildingType } from '../types/buildings.js';

/** Допустим ли номер комнаты для здания данного типа на данном этаже */
export function isValidRoomNumber(
  buildingType: BuildingType,
  floor: number,
  roomNumber: string
): boolean {
  if (buildingType === 'block') {
    return (
      new RegExp(`^${floor}-[1-9]\\d?-[1-9]\\d?$`).test(roomNumber) ||
      new RegExp(`^${floor}[1-9][1-9]$`).test(roomNumber)
    );
  }
  return new RegExp(`^${floor}(0[1-9]|[1-9]\\d)$`).test(roomNumber);
}

/** Пример допустимого номера для сообщения об ошибке */
export function roomNumberHint(buildingType: BuildingType, floor: number): string {
  return buildingType === 'block' ? `${floor}-1-1 или ${floor}11` : `${floor}01`;
}

/**
 * Номер блока из номера комнаты в блочном здании:
 * «7-3-2» -> 3, «643» -> 4 (после этажа идут блок и комната).
 * Для других типов зданий и неверных номеров возвращает null.
 */
export function blockOfRoom(
  buildingType: BuildingType,
  floor: number,
  roomNumber: string
): number | null {
  if (buildingType !== 'block' || !isValidRoomNumber(buildingType, floor, roomNumber)) {
    return null;
  }
  const dashed = new RegExp(`^${floor}-([1-9]\\d?)-[1-9]\\d?$`).exec(roomNumber);
  if (dashed) {
    return Number(dashed[1]);
  }
  const compact = new RegExp(`^${floor}([1-9])[1-9]$`).exec(roomNumber);
  return compact ? Number(compact[1]) : null;
}