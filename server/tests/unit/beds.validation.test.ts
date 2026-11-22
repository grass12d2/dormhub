import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeBedValues } from '../../src/services/beds.service.js';
import type { BedValues } from '../../src/types/beds.js';
import {
  createBedSchema,
  listBedsQuerySchema,
  patchBedSchema,
  replaceBedSchema,
} from '../../src/validation/beds.validation.js';

const ROOM_ID = randomUUID();
const VALID_BED = { roomId: ROOM_ID, bedNumber: 1 };

function withOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...VALID_BED, ...overrides };
}

function without(key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...VALID_BED };
  delete copy[key];
  return copy;
}

const INVALID_BEDS: Array<[string, Record<string, unknown>]> = [
  ['номер койки 0', withOverrides({ bedNumber: 0 })],
  ['номер койки 100', withOverrides({ bedNumber: 100 })],
  ['номер койки не целый', withOverrides({ bedNumber: 1.5 })],
  ['неизвестный статус', withOverrides({ status: 'broken' })],
  ['идентификатор комнаты не UUID', withOverrides({ roomId: 'not-a-uuid' })],
  ['лишнее поле', withOverrides({ foo: 1 })],
];

describe('createBedSchema', () => {
  it('принимает корректные данные без статуса', () => {
    expect(createBedSchema.safeParse(VALID_BED).success).toBe(true);
  });

  it('принимает статус maintenance', () => {
    expect(createBedSchema.safeParse(withOverrides({ status: 'maintenance' })).success).toBe(true);
  });

  it.each(INVALID_BEDS)('отклоняет: %s', (_name, body) => {
    expect(createBedSchema.safeParse(body).success).toBe(false);
  });

  it.each(['roomId', 'bedNumber'])('отклоняет данные без поля %s', (key) => {
    expect(createBedSchema.safeParse(without(key)).success).toBe(false);
  });

  it('приводит идентификатор комнаты к нижнему регистру', () => {
    const result = createBedSchema.safeParse(withOverrides({ roomId: ROOM_ID.toUpperCase() }));

    expect(result.data?.roomId).toBe(ROOM_ID);
  });
});

describe('replaceBedSchema', () => {
  it('принимает номер и статус', () => {
    expect(replaceBedSchema.safeParse({ bedNumber: 2, status: 'available' }).success).toBe(true);
  });

  it('отклоняет roomId: койку нельзя переносить между комнатами', () => {
    const result = replaceBedSchema.safeParse({ roomId: ROOM_ID, bedNumber: 2, status: 'available' });

    expect(result.success).toBe(false);
  });

  it('отклоняет данные без статуса', () => {
    expect(replaceBedSchema.safeParse({ bedNumber: 2 }).success).toBe(false);
  });
});

describe('patchBedSchema', () => {
  it('принимает одно поле', () => {
    expect(patchBedSchema.safeParse({ status: 'maintenance' }).success).toBe(true);
  });

  it('отклоняет пустой объект', () => {
    expect(patchBedSchema.safeParse({}).success).toBe(false);
  });

  it('отклоняет неизвестное поле', () => {
    expect(patchBedSchema.safeParse({ foo: 1 }).success).toBe(false);
  });

  it('отклоняет roomId', () => {
    expect(patchBedSchema.safeParse({ roomId: ROOM_ID }).success).toBe(false);
  });
});

describe('listBedsQuerySchema', () => {
  it('принимает запрос без параметров', () => {
    expect(listBedsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('приводит roomId к нижнему регистру', () => {
    const result = listBedsQuerySchema.safeParse({ roomId: ROOM_ID.toUpperCase() });

    expect(result.data?.roomId).toBe(ROOM_ID);
  });

  it('отклоняет roomId, не являющийся UUID', () => {
    expect(listBedsQuerySchema.safeParse({ roomId: 'abc' }).success).toBe(false);
  });

  it('отклоняет неизвестный параметр', () => {
    expect(listBedsQuerySchema.safeParse({ floor: '2' }).success).toBe(false);
  });
});

describe('mergeBedValues', () => {
  const CURRENT: BedValues = { roomId: ROOM_ID, bedNumber: 2, status: 'available' };

  it('меняет только указанные поля и не трогает комнату', () => {
    expect(mergeBedValues(CURRENT, { status: 'maintenance' })).toEqual({
      ...CURRENT,
      status: 'maintenance',
    });
  });

  it('заменяет все переданные поля', () => {
    expect(mergeBedValues(CURRENT, { bedNumber: 3, status: 'maintenance' })).toEqual({
      roomId: ROOM_ID,
      bedNumber: 3,
      status: 'maintenance',
    });
  });
});