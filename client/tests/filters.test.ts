import { describe, expect, it } from 'vitest';
import {
  EMPTY_SELECTION,
  floorOptions,
  matchesPlacement,
  pruneSelection,
  roomNumberOptions,
  toggleValue,
} from '../src/lib/filters';

const rooms = [
  { buildingId: 'b1', floor: 2, roomNumber: '201' },
  { buildingId: 'b1', floor: 5, roomNumber: '520' },
  { buildingId: 'b2', floor: 2, roomNumber: '201' },
  { buildingId: 'b2', floor: 5, roomNumber: '520' },
];

describe('matchesPlacement', () => {
  const item = { buildingId: 'b1', floor: 5, roomNumber: '520' };

  it('пустой выбор пропускает всё', () => {
    expect(matchesPlacement(item, EMPTY_SELECTION)).toBe(true);
  });

  it('все три условия должны выполняться, внутри условия достаточно одного значения', () => {
    expect(matchesPlacement(item, { buildings: ['b1', 'b2'], floors: [5], rooms: ['520'] })).toBe(true);
    expect(matchesPlacement(item, { buildings: ['b2'], floors: [], rooms: [] })).toBe(false);
    expect(matchesPlacement(item, { buildings: [], floors: [2], rooms: [] })).toBe(false);
    expect(matchesPlacement(item, { buildings: [], floors: [], rooms: ['201'] })).toBe(false);
  });

  it('один номер комнаты находит комнаты с этим номером в обоих общежитиях', () => {
    const selection = { buildings: ['b1', 'b2'], floors: [5], rooms: ['520'] };
    const found = rooms.filter((room) => matchesPlacement(room, selection));
    expect(found.map((room) => room.buildingId)).toEqual(['b1', 'b2']);
  });
});

describe('варианты фильтров', () => {
  it('этажи: без выбора общежития все, иначе только этажи выбранных общежитий', () => {
    expect(floorOptions(rooms, [])).toEqual([2, 5]);
    expect(floorOptions(rooms, ['b1'])).toEqual([2, 5]);
  });

  it('номера комнат уникальны: одинаковые номера разных общежитий объединяются', () => {
    expect(roomNumberOptions(rooms, ['b1', 'b2'], [5])).toEqual(['520']);
    expect(roomNumberOptions(rooms, ['b1', 'b2'], [])).toEqual(['201', '520']);
  });

  it('без выбора общежития список номеров пуст', () => {
    expect(roomNumberOptions(rooms, [], [])).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('убирает этажи и номера, которых нет в выбранных общежитиях и этажах', () => {
    const result = pruneSelection({ buildings: ['b1'], floors: [5], rooms: ['520', '201'] }, rooms);
    expect(result).toEqual({ buildings: ['b1'], floors: [5], rooms: ['520'] });
  });

  it('без выбранного общежития номера комнат сбрасываются', () => {
    expect(pruneSelection({ buildings: [], floors: [], rooms: ['520'] }, rooms).rooms).toEqual([]);
  });
});

describe('toggleValue', () => {
  it('добавляет и убирает значение', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});