import { describe, expect, it } from 'vitest';
import { compareValues, matchesQuery, nextSort, paginate, sortRows } from '../src/lib/table';

describe('compareValues', () => {
  it('числа сравниваются по величине, строки с учётом чисел и русского алфавита', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues('Комната 2', 'Комната 10')).toBeLessThan(0);
    expect(compareValues('Ёж', 'Яма')).toBeLessThan(0);
  });

  it('пустые значения идут после непустых', () => {
    expect(compareValues(null, 'а')).toBeGreaterThan(0);
    expect(compareValues('а', undefined)).toBeLessThan(0);
    expect(compareValues('', null)).toBe(0);
  });
});

describe('matchesQuery', () => {
  it('пустой запрос подходит всем', () => {
    expect(matchesQuery(['Иванов'], '  ')).toBe(true);
  });

  it('все слова должны встретиться, регистр не важен', () => {
    expect(matchesQuery(['Иванов Иван', '2630001'], 'иван иванов')).toBe(true);
    expect(matchesQuery(['Иванов Иван', '2630001'], 'иван петров')).toBe(false);
    expect(matchesQuery(['Иванов', null, undefined, 42], '42')).toBe(true);
  });
});

describe('sortRows', () => {
  const rows = [{ n: 'б' }, { n: 'а' }, { n: null }, { n: 'в' }];
  const get = (row: { n: string | null }) => row.n;

  it('по возрастанию и убыванию; пустые всегда в конце', () => {
    expect(sortRows(rows, { key: 'n', direction: 'asc' }, get).map((r) => r.n)).toEqual(['а', 'б', 'в', null]);
    expect(sortRows(rows, { key: 'n', direction: 'desc' }, get).map((r) => r.n)).toEqual(['в', 'б', 'а', null]);
  });

  it('без сортировки порядок сохраняется, исходный массив не меняется', () => {
    expect(sortRows(rows, null, get)).toBe(rows);
    sortRows(rows, { key: 'n', direction: 'asc' }, get);
    expect(rows.map((r) => r.n)).toEqual(['б', 'а', null, 'в']);
  });
});

describe('paginate', () => {
  const data = Array.from({ length: 45 }, (_, index) => index + 1);

  it('возвращает нужную страницу и общие числа', () => {
    const result = paginate(data, 2, 20);
    expect(result.items[0]).toBe(21);
    expect(result.items).toHaveLength(20);
    expect(result).toMatchObject({ total: 45, page: 2, pageCount: 3 });
  });

  it('последняя страница неполная, выход за границы исправляется', () => {
    expect(paginate(data, 3, 20).items).toHaveLength(5);
    expect(paginate(data, 99, 20).page).toBe(3);
    expect(paginate(data, 0, 20).page).toBe(1);
  });

  it('пустой список: одна страница без записей', () => {
    expect(paginate([], 1, 20)).toEqual({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});

describe('nextSort', () => {
  it('цикл: нет, по возрастанию, по убыванию, нет', () => {
    const first = nextSort(null, 'name');
    expect(first).toEqual({ key: 'name', direction: 'asc' });
    const second = nextSort(first, 'name');
    expect(second).toEqual({ key: 'name', direction: 'desc' });
    expect(nextSort(second, 'name')).toBeNull();
  });

  it('другой столбец начинает с возрастания', () => {
    expect(nextSort({ key: 'a', direction: 'desc' }, 'b')).toEqual({ key: 'b', direction: 'asc' });
  });
});