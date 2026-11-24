/** Чистая логика фильтров «общежитие, этаж, номер комнаты» с множественным выбором */

export interface Placement {
  buildingId: string;
  floor: number;
  roomNumber: string;
}

export interface FilterSelection {
  buildings: string[];
  floors: number[];
  /** Номера комнат: один номер выбирает комнаты с этим номером во всех выбранных общежитиях */
  rooms: string[];
}

export const EMPTY_SELECTION: FilterSelection = { buildings: [], floors: [], rooms: [] };

/** Пустой набор означает «не фильтровать» */
function allows<T>(selected: T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

export function matchesPlacement(item: Placement, selection: FilterSelection): boolean {
  return (
    allows(selection.buildings, item.buildingId) &&
    allows(selection.floors, item.floor) &&
    allows(selection.rooms, item.roomNumber)
  );
}

/** Этажи, на которых есть комнаты выбранных общежитий (без выбора общежитий — все этажи) */
export function floorOptions(
  rooms: Array<{ buildingId: string; floor: number }>,
  buildings: string[]
): number[] {
  const floors = new Set(
    rooms.filter((room) => allows(buildings, room.buildingId)).map((room) => room.floor)
  );
  return [...floors].sort((a, b) => a - b);
}

/**
 * Уникальные номера комнат выбранных общежитий и этажей.
 * Без выбора общежития список пуст (он слишком длинный).
 */
export function roomNumberOptions(
  rooms: Array<{ buildingId: string; floor: number; roomNumber: string }>,
  buildings: string[],
  floors: number[]
): string[] {
  if (buildings.length === 0) {
    return [];
  }
  const numbers = new Set(
    rooms
      .filter((room) => allows(buildings, room.buildingId) && allows(floors, room.floor))
      .map((room) => room.roomNumber)
  );
  return [...numbers].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

/** Убирает из выбора то, чего больше нет среди доступных вариантов */
export function pruneSelection(
  selection: FilterSelection,
  rooms: Array<{ buildingId: string; floor: number; roomNumber: string }>
): FilterSelection {
  const floors = floorOptions(rooms, selection.buildings);
  const available = new Set(roomNumberOptions(rooms, selection.buildings, selection.floors));
  return {
    buildings: selection.buildings,
    floors: selection.floors.filter((floor) => floors.includes(floor)),
    rooms: selection.rooms.filter((number) => available.has(number)),
  };
}

export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}