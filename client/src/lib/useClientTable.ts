import { useMemo, useState } from 'react';
import { matchesQuery, paginate, sortRows, type CellValue, type SortState } from './table';

export interface ClientTableOptions<T> {
  rows: T[];
  /** Тексты строки для поиска */
  searchText: (row: T) => CellValue[];
  /** Значение столбца для сортировки по ключу */
  sortValue: (row: T, key: string) => CellValue;
  pageSize?: number;
  initialQuery?: string;
}

/** Таблица на стороне браузера: данные загружены целиком, поиск, сортировка и страницы считаются на месте */
export function useClientTable<T>(options: ClientTableOptions<T>) {
  const { rows, searchText, sortValue, pageSize = 20, initialQuery = '' } = options;
  const [query, setQueryState] = useState(initialQuery);
  const [sort, setSortState] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => rows.filter((row) => matchesQuery(searchText(row), query)),
    [rows, query, searchText]
  );
  const sorted = useMemo(() => sortRows(filtered, sort, sortValue), [filtered, sort, sortValue]);
  const result = useMemo(() => paginate(sorted, page, pageSize), [sorted, page, pageSize]);

  return {
    query,
    // При новом запросе или сортировке возвращаемся на первую страницу
    setQuery: (value: string) => {
      setQueryState(value);
      setPage(1);
    },
    sort,
    setSort: (value: SortState | null) => {
      setSortState(value);
      setPage(1);
    },
    page: result.page,
    setPage,
    pageCount: result.pageCount,
    total: result.total,
    pageSize,
    items: result.items,
  };
}