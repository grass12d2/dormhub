/** Дата рождения из трёх полей (день, месяц, год) и обратно в строку ГГГГ-ММ-ДД */

export const MIN_BIRTH_YEAR = 1900;

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

export const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Разбор строки ГГГГ-ММ-ДД; неверная строка даёт пустые поля */
export function splitDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return EMPTY_DATE;
  }
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) };
}

/** Сборка строки ГГГГ-ММ-ДД; null, если поля не заполнены или дата не существует */
export function joinDate(parts: DateParts): string | null {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!parts.year || !parts.month || !parts.day) {
    return null;
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  const pad = (n: number, size: number) => String(n).padStart(size, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Дата рождения допустима: не раньше 1900 года и не в будущем */
export function isPlausibleBirthDate(value: string, today: Date = new Date()): boolean {
  const limit = today.toISOString().slice(0, 10);
  return value >= `${MIN_BIRTH_YEAR}-01-01` && value <= limit;
}

/** Годы для списка: от текущего до 1900, по убыванию */
export function yearOptions(today: Date = new Date()): number[] {
  const last = today.getUTCFullYear();
  return Array.from({ length: last - MIN_BIRTH_YEAR + 1 }, (_, index) => last - index);
}

export const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];