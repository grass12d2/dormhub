import { describe, expect, it } from 'vitest';
import type { BuildingType } from '../../src/types/buildings.js';
import { isValidRoomNumber, roomNumberHint } from '../../src/utils/room-number.js';

type Case = [BuildingType, number, string];

const VALID: Case[] = [
  ['corridor', 2, '201'],
  ['corridor', 2, '220'],
  ['corridor', 2, '299'],
  ['corridor', 16, '1601'],
  ['corridor', 3, '324'],
  ['apartment', 10, '1001'],
  ['apartment', 12, '1216'],
  ['block', 7, '7-3-2'],
  ['block', 16, '16-4-5'],
  ['block', 6, '643'],
  ['block', 12, '1243'],
  ['block', 3, '311'],
];

const INVALID: Case[] = [
  ['corridor', 3, '201'],
  ['corridor', 2, '2001'],
  ['corridor', 2, '200'],
  ['corridor', 2, '21'],
  ['corridor', 2, '2-01'],
  ['corridor', 2, 'A201'],
  ['corridor', 2, '201a'],
  ['apartment', 2, '7-3-2'],
  ['block', 7, '8-3-2'],
  ['block', 7, '7-0-2'],
  ['block', 7, '7-3-0'],
  ['block', 6, '630'],
  ['block', 6, '603'],
  ['block', 6, '6431'],
  ['block', 7, '7--2'],
  ['block', 7, '7-3-'],
  ['block', 2, '201'],
];

describe('isValidRoomNumber', () => {
  it.each(VALID)('%s, этаж %i: номер «%s» допустим', (type, floor, roomNumber) => {
    expect(isValidRoomNumber(type, floor, roomNumber)).toBe(true);
  });

  it.each(INVALID)('%s, этаж %i: номер «%s» недопустим', (type, floor, roomNumber) => {
    expect(isValidRoomNumber(type, floor, roomNumber)).toBe(false);
  });
});

describe('roomNumberHint', () => {
  it('для corridor — этаж и 01', () => {
    expect(roomNumberHint('corridor', 2)).toBe('201');
  });

  it('для apartment — этаж и 01', () => {
    expect(roomNumberHint('apartment', 12)).toBe('1201');
  });

  it('для block — оба формата', () => {
    expect(roomNumberHint('block', 7)).toBe('7-1-1 или 711');
  });
});