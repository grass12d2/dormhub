import { describe, expect, it } from 'vitest';
import { blockOfRoom } from '../../src/utils/room-number.js';

describe('blockOfRoom', () => {
  it.each([
    ['block', 7, '7-3-2', 3],
    ['block', 6, '643', 4],
    ['block', 12, '12-10-1', 10],
    ['block', 7, '8-3-2', null],
    ['corridor', 2, '201', null],
    ['apartment', 10, '1001', null],
  ] as const)('%s, этаж %i, «%s» даёт %s', (type, floor, number, expected) => {
    expect(blockOfRoom(type, floor, number)).toBe(expected);
  });
});