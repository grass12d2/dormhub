import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toggleValue } from '../../lib/filters';
import { matchesQuery } from '../../lib/table';

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export interface MultiSelectProps<T extends string | number> {
  label: string;
  options: Option<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  /** Подсказка, когда вариантов нет */
  emptyHint?: string;
  disabled?: boolean;
}

/** Выпадающий список с множественным выбором и быстрым поиском */
export function MultiSelect<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  emptyHint = 'Нет вариантов',
  disabled = false,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // Закрытие по щелчку снаружи и клавише Esc
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = useMemo(
    () => options.filter((option) => matchesQuery([option.label], query)),
    [options, query]
  );
  const summary =
    selected.length === 0
      ? 'Все'
      : options
          .filter((option) => selected.includes(option.value))
          .map((option) => option.label)
          .slice(0, 2)
          .join(', ') + (selected.length > 2 ? ` +${selected.length - 2}` : '');

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-10 max-w-64 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          selected.length > 0 ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface'
        }`}
      >
        <span className="text-muted">{label}:</span>
        <span className="truncate font-medium">{summary}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="animate-pop-in absolute top-full left-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-pop">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти"
            aria-label={`Найти: ${label}`}
            className="mb-2 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary"
          />
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto">
            {visible.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <li key={option.value} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onClick={() => onChange(toggleValue(selected, option.value))}
                    className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        checked ? 'border-primary bg-primary text-on-primary' : 'border-border'
                      }`}
                    >
                      {checked ? <Check size={12} aria-hidden="true" /> : null}
                    </span>
                    {option.label}
                  </button>
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="px-2 py-2 text-sm text-muted">{emptyHint}</li>
            ) : null}
          </ul>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-surface-2"
            >
              Сбросить
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}