import { describe, expect, it } from 'vitest';
import { EMPTY_ROOM_FORM, toRoomInput, validateRoomForm } from '../src/lib/roomForm';

const valid = { buildingId: 'b1', roomNumber: ' 201 ', floor: '2', capacity: '3' };

describe('validateRoomForm', () => {
  it('корректная форма без ошибок', () => {
    expect(validateRoomForm(valid, 16)).toEqual({});
  });

  it('пустая форма: ошибки по общежитию, номеру и этажу', () => {
    expect(Object.keys(validateRoomForm(EMPTY_ROOM_FORM)).sort()).toEqual([
      'buildingId',
      'floor',
      'roomNumber',
    ]);
  });

  it.each(['0', '1', 'a', '2.5'])('этаж «%s» отклоняется', (floor) => {
    expect(validateRoomForm({ ...valid, floor })).toHaveProperty('floor');
  });

  it('этаж выше числа этажей общежития отклоняется, равный допустим', () => {
    expect(validateRoomForm({ ...valid, floor: '6' }, 5)).toHaveProperty('floor');
    expect(validateRoomForm({ ...valid, floor: '5' }, 5)).toEqual({});
  });

  it.each(['1', '5', 'x'])('вместимость «%s» отклоняется', (capacity) => {
    expect(validateRoomForm({ ...valid, capacity })).toHaveProperty('capacity');
  });
});

describe('toRoomInput', () => {
  it('обрезает пробелы и приводит числа', () => {
    expect(toRoomInput(valid)).toEqual({ buildingId: 'b1', roomNumber: '201', floor: 2, capacity: 3 });
  });
});