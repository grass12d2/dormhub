/** Чистая логика таблиц: поиск, сортировка и постраничный вывод на стороне браузера */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

/** Значение ячейки для сортировки и поиска */
export type CellValue = string | number | null | undefined;

const COLLATOR = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/** Сравнение значений: числа по величине, строки по алфавиту с учётом чисел; пустые в конце */
export function compareValues(a: CellValue, b: CellValue): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) {
    return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return COLLATOR.compare(String(a), String(b));
}

/** Подходит ли строка под поисковый запрос: все слова запроса должны встретиться в тексте */
export function matchesQuery(texts: CellValue[], query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = texts
    .filter((text) => text !== null && text !== undefined)
    .map((text) => String(text).toLowerCase())
    .join(' ');
  return words.every((word) => haystack.includes(word));
}

/** Сортировка без изменения исходного массива; пустые значения всегда в конце */
export function sortRows<T>(
  rows: T[],
  sort: SortState | null,
  getValue: (row: T, key: string) => CellValue
): T[] {
  if (!sort) {
    return rows;
  }
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = getValue(a, sort.key);
    const right = getValue(b, sort.key);
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty || rightEmpty) {
      return compareValues(left, right);
    }
    return sign * compareValues(left, right);
  });
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

/** Страница данных (нумерация с 1); номер страницы приводится к допустимому диапазону */
export function paginate<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total, page: safePage, pageCount };
}

/** Следующее направление сортировки при щелчке по заголовку: нет → по возрастанию → по убыванию → нет */
export function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) {
    return { key, direction: 'asc' };
  }
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}