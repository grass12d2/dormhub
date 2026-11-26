import { useEffect, useRef, useState } from 'react';
import { facultyLabel, findFaculty, searchFaculties } from '../../lib/faculties';
import { Input } from './Input';

export interface FacultyComboboxProps {
  /** Код института или пустая строка */
  value: string;
  onChange: (code: string) => void;
  id?: string;
  invalid?: boolean;
}

/** Поле с подсказками: при вводе показывает подходящие институты из списка в 17 пунктов */
export function FacultyCombobox({ value, onChange, id, invalid }: FacultyComboboxProps) {
  const [text, setText] = useState(() => {
    const found = findFaculty(value);
    return found ? facultyLabel(found) : value;
  });
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Внешнее значение сменилось: обновляем текст
  useEffect(() => {
    const found = findFaculty(value);
    setText(found ? facultyLabel(found) : value);
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
        // Неполный ввод не принимается: возвращаем выбранный институт
        const found = findFaculty(value);
        setText(found ? facultyLabel(found) : '');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, value]);

  const options = searchFaculties(open ? text : '');

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Начните вводить код или название"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          if (event.target.value === '') {
            onChange('');
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul
          role="listbox"
          className="animate-pop-in absolute top-full right-0 left-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop"
        >
          {options.map((faculty) => (
            <li key={faculty.code} role="option" aria-selected={faculty.code === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(faculty.code);
                  setText(facultyLabel(faculty));
                  setOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="font-medium">{faculty.code}</span>
                <span className="text-muted"> — {faculty.name}</span>
              </button>
            </li>
          ))}
          {options.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Ничего не найдено</li> : null}
        </ul>
      ) : null}
    </div>
  );
}