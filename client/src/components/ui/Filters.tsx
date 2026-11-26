import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { matchesQuery } from '../../lib/table';

/**
 * Единый вид фильтров над таблицами: «пилюля» высотой 10 с подписью «Метка: значение»,
 * выбранный фильтр подсвечивается цветом акцента. Так выглядят MultiSelect, FilterSelect,
 * FilterToggle и FilterInput.
 */
export const filterTrigger = (active: boolean) =>
  `flex h-10 max-w-64 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
    active ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg hover:bg-surface-2'
  }`;

/** Выпадающая панель фильтра; на узком экране не выходит за его край */
export const FILTER_PANEL =
  'animate-pop-in absolute top-full left-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2 shadow-pop';

/** Поиск внутри панели */
export const FILTER_SEARCH =
  'mb-2 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none';

/** Пункт списка в панели */
export const FILTER_OPTION = 'flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-surface-2';

/** Кнопка «Сбросить» внизу панели */
export const FILTER_RESET =
  'mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-surface-2';

/** Закрытие панели по щелчку снаружи и клавише Esc */
export function useDismiss(open: boolean, boxRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, boxRef, close]);
}

/** Содержимое кнопки фильтра: «Метка: значение ⌄» */
export function TriggerContent({ label, summary }: { label: string; summary: ReactNode }) {
  return (
    <>
      <span className="shrink-0 text-muted">{label}:</span>
      <span className="truncate font-medium">{summary}</span>
      <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
    </>
  );
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

/** Фильтр с выбором одного значения; пустая строка — «все». Поиск появляется при длинном списке */
export function FilterSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  allLabel = 'Все',
}: {
  label: string;
  options: FilterOption<T>[];
  value: T | '';
  onChange: (value: T | '') => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, boxRef, close);

  const searchable = options.length > 8;
  const visible = useMemo(
    () => (searchable ? options.filter((option) => matchesQuery([option.label], query)) : options),
    [options, query, searchable]
  );
  const current = options.find((option) => option.value === value);

  const pick = (next: T | '') => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={filterTrigger(Boolean(current))}
      >
        <TriggerContent label={label} summary={current?.label ?? allLabel} />
      </button>
      {open ? (
        <div className={FILTER_PANEL}>
          {searchable ? (
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти"
              aria-label={`Найти: ${label}`}
              className={FILTER_SEARCH}
            />
          ) : null}
          <ul role="listbox" aria-label={label} className="max-h-60 overflow-y-auto">
            {query ? null : (
              <li role="option" aria-selected={!current}>
                <button type="button" onClick={() => pick('')} className={FILTER_OPTION}>
                  <span className="flex size-4 shrink-0 items-center justify-center text-primary">
                    {current ? null : <Check size={14} aria-hidden="true" />}
                  </span>
                  {allLabel}
                </button>
              </li>
            )}
            {visible.map((option) => {
              const selected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => pick(option.value)}
                    className={`${FILTER_OPTION} ${selected ? 'font-medium text-primary' : ''}`}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {selected ? <Check size={14} aria-hidden="true" /> : null}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 ? <li className="px-2 py-2 text-sm text-muted">Нет вариантов</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Фильтр-переключатель («Просроченные»): та же пилюля, включённый — с галочкой и цветом акцента */
export function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)} className={filterTrigger(checked)}>
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
          checked ? 'border-primary bg-primary text-on-primary' : 'border-border'
        }`}
      >
        {checked ? <Check size={12} aria-hidden="true" /> : null}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

/** Поле ввода в виде пилюли фильтра: «Метка: [значение]» (буквы группы, даты) */
export function FilterInput({
  label,
  className = '',
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const active = rest.value !== undefined && rest.value !== '';
  return (
    <label className={`${filterTrigger(active)} cursor-text focus-within:border-primary`}>
      <span className="shrink-0 text-muted">{label}:</span>
      <input
        {...rest}
        className={`min-w-0 bg-transparent font-medium text-inherit placeholder:font-normal placeholder:text-muted focus:outline-none ${className}`}
      />
    </label>
  );
}
