import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { nextSort, type CellValue, type SortState } from '../../lib/table';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { IconInput } from '../ui/IconInput';
import { Skeleton } from '../ui/Skeleton';
import { Pagination } from './Pagination';

export interface Column<T> {
  key: string;
  header: string;
  /** Что показать в ячейке */
  render: (row: T) => ReactNode;
  /** Значение для сортировки; без него столбец не сортируется */
  sortValue?: (row: T) => CellValue;
  /** Выравнивание: числа удобнее справа */
  align?: 'left' | 'right';
  /** Скрыть столбец на узких экранах */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  /** Строка поиска (управляется снаружи) */
  query: string;
  onQuery: (value: string) => void;
  searchPlaceholder?: string;
  sort: SortState | null;
  onSort: (sort: SortState | null) => void;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  /** Фильтры и кнопки справа от строки поиска */
  toolbar?: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
}

const SKELETON_ROWS = 6;

/** Универсальная таблица: поиск, сортировка по заголовкам, постраничный вывод, состояния загрузки и ошибки */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    rows,
    rowKey,
    loading,
    error,
    onRetry,
    query,
    onQuery,
    searchPlaceholder = 'Поиск',
    sort,
    onSort,
    page,
    pageCount,
    total,
    pageSize,
    onPage,
    toolbar,
    emptyTitle,
    emptyDescription,
  } = props;

  const cell = (column: Column<T>) =>
    `px-4 py-3 ${column.align === 'right' ? 'text-right' : 'text-left'} ${
      column.hideOnMobile ? 'hidden md:table-cell' : ''
    }`;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="min-w-48 flex-1">
          <IconInput
            icon={Search}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        {toolbar}
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-2 p-5">
          <p className="text-danger">{error}</p>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Повторить
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs tracking-wide text-muted uppercase">
                  {columns.map((column) => {
                    const sortable = Boolean(column.sortValue);
                    const active = sort?.key === column.key;
                    const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        className={`${cell(column)} font-medium`}
                        aria-sort={
                          active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                        }
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => onSort(nextSort(sort, column.key))}
                            className="inline-flex items-center gap-1 uppercase transition-colors hover:text-fg"
                          >
                            {column.header}
                            <Icon size={14} aria-hidden="true" className={active ? 'text-primary' : ''} />
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td key={column.key} className={cell(column)}>
                            <Skeleton className="h-4 w-full max-w-40" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr key={rowKey(row)} className="transition-colors hover:bg-surface-2">
                        {columns.map((column) => (
                          <td key={column.key} className={cell(column)}>
                            {column.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 ? (
            <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />
          ) : null}
          {!loading && total > 0 ? (
            <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={onPage} />
          ) : null}
        </>
      )}
    </Card>
  );
}