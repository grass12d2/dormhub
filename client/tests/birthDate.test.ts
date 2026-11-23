import { describe, expect, it } from 'vitest';
import {
  EMPTY_DATE,
  daysInMonth,
  isPlausibleBirthDate,
  joinDate,
  splitDate,
  yearOptions,
} from '../src/lib/birthDate';

describe('daysInMonth', () => {
  it('учитывает високосный год', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2005, 4)).toBe(30);
    expect(daysInMonth(2005, 12)).toBe(31);
  });
});

describe('splitDate и joinDate', () => {
  it('обратимы для верной даты', () => {
    const parts = splitDate('2005-01-09');
    expect(parts).toEqual({ year: '2005', month: '1', day: '9' });
    expect(joinDate(parts)).toBe('2005-01-09');
  });

  it('неверная строка даёт пустые поля', () => {
    expect(splitDate('01.01.2005')).toEqual(EMPTY_DATE);
    expect(splitDate('')).toEqual(EMPTY_DATE);
  });

  it.each([
    { day: '30', month: '2', year: '2005' },
    { day: '31', month: '4', year: '2005' },
    { day: '29', month: '2', year: '2023' },
    { day: '0', month: '1', year: '2005' },
    { day: '1', month: '13', year: '2005' },
    { day: '', month: '1', year: '2005' },
    { day: '1', month: '1', year: '' },
  ])('несуществующая или неполная дата %j даёт null', (parts) => {
    expect(joinDate(parts)).toBeNull();
  });

  it('29 февраля високосного года допустимо', () => {
    expect(joinDate({ day: '29', month: '2', year: '2004' })).toBe('2004-02-29');
  });
});

describe('isPlausibleBirthDate', () => {
  const today = new Date('2026-11-23T12:00:00Z');

  it('граница 1900 года и сегодняшняя дата допустимы', () => {
    expect(isPlausibleBirthDate('1900-01-01', today)).toBe(true);
    expect(isPlausibleBirthDate('2026-11-23', today)).toBe(true);
  });

  it('раньше 1900 и будущее недопустимы', () => {
    expect(isPlausibleBirthDate('1899-12-31', today)).toBe(false);
    expect(isPlausibleBirthDate('2026-11-24', today)).toBe(false);
  });
});

describe('yearOptions', () => {
  it('идут от текущего года до 1900 по убыванию', () => {
    const years = yearOptions(new Date('2026-11-23T12:00:00Z'));
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(1900);
    expect(years).toHaveLength(127);
  });
});