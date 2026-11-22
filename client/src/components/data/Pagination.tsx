import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

export interface PaginationProps {
  /** Номер текущей страницы, с 1 */
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}

/** Нижняя панель таблицы: диапазон записей и кнопки «назад» и «вперёд» */
export function Pagination({ page, pageCount, total, pageSize, onPage }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="tabular text-sm text-muted">
        {from}–{to} из {total}
      </p>
      <div className="flex items-center gap-2">
        <span className="tabular text-sm text-muted">
          Страница {page} из {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Предыдущая страница"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Следующая страница"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}