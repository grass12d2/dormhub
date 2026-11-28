import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  /** null — ещё не искали (пустой запрос или идёт поиск) */
  count: number | null;
  /** Текущее совпадение: 0 — самое новое */
  index: number;
  loading: boolean;
  /** К более раннему совпадению */
  onOlder: () => void;
  /** К более позднему совпадению */
  onNewer: () => void;
  onClose: () => void;
}

const ARROW = 'flex size-8 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent';

/** Строка поиска по открытой беседе: запрос, «N из M» и переход между совпадениями */
export function ChatFindBar({ query, onQuery, count, index, loading, onOlder, onNewer, onClose }: Props) {
  const status = !query.trim() ? '' : loading || count === null ? 'Поиск…' : count === 0 ? 'Не найдено' : `${index + 1} из ${count}`;
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-2">
        <Search size={16} aria-hidden="true" className="shrink-0 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            // Enter — к более раннему, Shift+Enter — к более позднему
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) onNewer();
              else onOlder();
            }
          }}
          placeholder="Поиск по беседе"
          aria-label="Поиск по беседе"
          className="h-9 min-w-0 flex-1 bg-transparent outline-none"
        />
        <span aria-live="polite" className="tabular shrink-0 text-xs text-muted">
          {status}
        </span>
      </div>
      <button type="button" className={ARROW} aria-label="Более раннее совпадение" title="Раньше (Enter)" disabled={!count || index >= count - 1} onClick={onOlder}>
        <ChevronUp size={18} aria-hidden="true" />
      </button>
      <button type="button" className={ARROW} aria-label="Более позднее совпадение" title="Позже (Shift+Enter)" disabled={!count || index <= 0} onClick={onNewer}>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <button type="button" className={ARROW} aria-label="Закрыть поиск" title="Закрыть" onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
