import { Check } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toggleValue } from '../../lib/filters';
import { matchesQuery } from '../../lib/table';
import { FILTER_OPTION, FILTER_PANEL, FILTER_RESET, FILTER_SEARCH, TriggerContent, filterTrigger, useDismiss } from './Filters';

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

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, boxRef, close);

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
        className={filterTrigger(selected.length > 0)}
      >
        <TriggerContent label={label} summary={summary} />
      </button>
      {open ? (
        <div className={FILTER_PANEL}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти"
            aria-label={`Найти: ${label}`}
            className={FILTER_SEARCH}
          />
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto">
            {visible.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <li key={option.value} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onClick={() => onChange(toggleValue(selected, option.value))}
                    className={FILTER_OPTION}
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
              className={FILTER_RESET}
            >
              Сбросить
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}