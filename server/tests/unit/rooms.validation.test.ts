import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeRoomValues, placementError } from '../../src/services/rooms.service.js';
import type { RoomValues } from '../../src/types/rooms.js';
import {
  createRoomSchema,
  listRoomsQuerySchema,
  patchRoomSchema,
} from '../../src/validation/rooms.validation.js';

const BUILDING_ID = randomUUID();
const VALID_ROOM = { buildingId: BUILDING_ID, roomNumber: '201', floor: 2, capacity: 3 };

function withOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...VALID_ROOM, ...overrides };
}

function without(key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...VALID_ROOM };
  delete copy[key];
  return copy;
}

const INVALID_ROOMS: Array<[string, Record<string, unknown>]> = [
  ['этаж 1: жилых комнат на первом этаже нет', withOverrides({ floor: 1 })],
  ['этаж 0', withOverrides({ floor: 0 })],
  ['этаж 101', withOverrides({ floor: 101 })],
  ['этаж не целый', withOverrides({ floor: 2.5 })],
  ['вместимость 1', withOverrides({ capacity: 1 })],
  ['вместимость 5', withOverrides({ capacity: 5 })],
  ['вместимость не целая', withOverrides({ capacity: 2.5 })],
  ['номер из одних пробелов', withOverrides({ roomNumber: '   ' })],
  ['номер длиннее 20 символов', withOverrides({ roomNumber: 'x'.repeat(21) })],
  ['идентификатор здания не UUID', withOverrides({ buildingId: 'not-a-uuid' })],
  ['номер комнаты числом', withOverrides({ roomNumber: 201 })],
  ['лишнее поле', withOverrides({ status: 'free' })],
];

describe('createRoomSchema', () => {
  it('принимает корректные данные', () => {
    expect(createRoomSchema.safeParse(VALID_ROOM).success).toBe(true);
  });

  it('приводит идентификатор здания к нижнему регистру', () => {
    const result = createRoomSchema.safeParse(
      withOverrides({ buildingId: BUILDING_ID.toUpperCase() })
    );

    expect(result.success).toBe(true);
    expect(result.data?.buildingId).toBe(BUILDING_ID);
  });

  it('обрезает пробелы по краям номера комнаты', () => {
    const result = createRoomSchema.safeParse(withOverrides({ roomNumber: ' 201 ' }));

    expect(result.data?.roomNumber).toBe('201');
  });

  it.each(INVALID_ROOMS)('отклоняет: %s', (_name, body) => {
    expect(createRoomSchema.safeParse(body).success).toBe(false);
  });

  it.each(['buildingId', 'roomNumber', 'floor', 'capacity'])(
    'отклоняет данные без поля %s',
    (key) => {
      expect(createRoomSchema.safeParse(without(key)).success).toBe(false);
    }
  );

  it('принимает вместимость 2, 3 и 4', () => {
    for (const capacity of [2, 3, 4]) {
      expect(createRoomSchema.safeParse(withOverrides({ capacity })).success).toBe(true);
    }
  });
});

describe('patchRoomSchema', () => {
  it('принимает одно поле', () => {
    expect(patchRoomSchema.safeParse({ capacity: 2 }).success).toBe(true);
  });

  it('отклоняет пустой объект', () => {
    expect(patchRoomSchema.safeParse({}).success).toBe(false);
  });

  it('отклоняет неизвестное поле', () => {
    expect(patchRoomSchema.safeParse({ foo: 1 }).success).toBe(false);
  });

  it('отклоняет некорректное значение поля', () => {
    expect(patchRoomSchema.safeParse({ floor: 1 }).success).toBe(false);
  });
});

describe('listRoomsQuerySchema', () => {
  it('принимает запрос без параметров', () => {
    expect(listRoomsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('приводит buildingId к нижнему регистру', () => {
    const result = listRoomsQuerySchema.safeParse({ buildingId: BUILDING_ID.toUpperCase() });

    expect(result.data?.buildingId).toBe(BUILDING_ID);
  });

  it('отклоняет buildingId, не являющийся UUID', () => {
    expect(listRoomsQuerySchema.safeParse({ buildingId: 'abc' }).success).toBe(false);
  });

  it('отклоняет неизвестный параметр', () => {
    expect(listRoomsQuerySchema.safeParse({ floor: '2' }).success).toBe(false);
  });
});

describe('mergeRoomValues', () => {
  const CURRENT: RoomValues = {
    buildingId: BUILDING_ID,
    roomNumber: '305',
    floor: 3,
    capacity: 3,
  };

  it('меняет только указанные поля', () => {
    expect(mergeRoomValues(CURRENT, { capacity: 2 })).toEqual({ ...CURRENT, capacity: 2 });
  });

  it('заменяет все переданные поля', () => {
    const patch = { buildingId: randomUUID(), roomNumber: '412', floor: 4, capacity: 4 };

    expect(mergeRoomValues(CURRENT, patch)).toEqual(patch);
  });
});

describe('placementError', () => {
  const BUILDING = { floors_count: 10, building_type: 'corridor' as const };

  it('допускает комнату на последнем этаже здания', () => {
    expect(placementError(BUILDING, { floor: 10, roomNumber: '1001' })).toBeNull();
  });

  it('отклоняет этаж выше числа этажей здания', () => {
    const message = placementError(BUILDING, { floor: 11, roomNumber: '1101' });

    expect(message).toContain('(10)');
  });

  it('отклоняет номер, не соответствующий этажу, и подсказывает пример', () => {
    const message = placementError(BUILDING, { floor: 3, roomNumber: '201' });

    expect(message).toContain('Пример: 301');
  });

  it('учитывает тип здания: для block допустим формат 7-3-2', () => {
    const block = { floors_count: 16, building_type: 'block' as const };

    expect(placementError(block, { floor: 7, roomNumber: '7-3-2' })).toBeNull();
  });
});