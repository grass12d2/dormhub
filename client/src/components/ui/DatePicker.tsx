import { useEffect, useMemo, useState } from 'react';
import {
  EMPTY_DATE,
  MONTH_NAMES,
  daysInMonth,
  joinDate,
  splitDate,
  yearOptions,
  type DateParts,
} from '../../lib/birthDate';
import { Select } from './Input';

export interface DatePickerProps {
  /** Значение в формате ГГГГ-ММ-ДД или пустая строка */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
}

/** Выбор даты тремя списками; неполный ввод хранится внутри, наружу уходит только полная дата */
export function DatePicker({ value, onChange, id, invalid }: DatePickerProps) {
  const [parts, setParts] = useState<DateParts>(() => splitDate(value));
  const years = useMemo(() => yearOptions(), []);

  // Внешнее значение сменилось (например, открыта форма другого студента)
  useEffect(() => {
    const external = splitDate(value);
    if (value === '' ? false : joinDate(parts) !== value) {
      setParts(external);
    } else if (value === '' && joinDate(parts) !== null) {
      setParts(EMPTY_DATE);
    }
    // parts намеренно не в зависимостях: синхронизация только по внешнему значению
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const change = (next: Partial<DateParts>) => {
    const merged = { ...parts, ...next };
    const max =
      merged.year && merged.month ? daysInMonth(Number(merged.year), Number(merged.month)) : 31;
    if (merged.day && Number(merged.day) > max) {
      merged.day = '';
    }
    setParts(merged);
    onChange(joinDate(merged) ?? '');
  };

  const maxDay =
    parts.year && parts.month ? daysInMonth(Number(parts.year), Number(parts.month)) : 31;

  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2" role="group" aria-label="Дата рождения">
      <Select id={id} aria-label="День" aria-invalid={invalid} value={parts.day} onChange={(e) => change({ day: e.target.value })}>
        <option value="">День</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </Select>
      <Select aria-label="Месяц" aria-invalid={invalid} value={parts.month} onChange={(e) => change({ month: e.target.value })}>
        <option value="">Месяц</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </Select>
      <Select aria-label="Год" aria-invalid={invalid} value={parts.year} onChange={(e) => change({ year: e.target.value })}>
        <option value="">Год</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
    </div>
  );
}