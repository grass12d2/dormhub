/**
 * Расчёты для «Обзора» студента: дежурство комнаты, комендантский час, сроки договора.
 * Всё считается на клиенте по уже загруженным данным, без отдельного хранения.
 */
import type { Invoice } from '../api/invoices';

/** Русское склонение: plural(5, 'день', 'дня', 'дней') → «дней» */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return many;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
}

/** Дни недели с понедельника: «пятница», «по пятницам» */
export const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'] as const;
export const WEEKDAYS_EVERY = [
  'по понедельникам',
  'по вторникам',
  'по средам',
  'по четвергам',
  'по пятницам',
  'по субботам',
  'по воскресеньям',
] as const;

/** День недели с понедельника (0) по воскресенье (6) */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * День дежурства комнаты по кухне, душевым и туалетам: один день в неделю.
 * Берётся номер комнаты на этаже (две последние цифры): комната 01 — понедельник, 02 — вторник, …,
 * 08 — снова понедельник. Если цифр нет, день выбирается по буквам номера — тоже всегда один и тот же.
 */
export function dutyWeekday(roomNumber: string): number {
  const digits = roomNumber.replace(/\D/g, '');
  if (digits) {
    const onFloor = Number(digits.slice(-2));
    return (((onFloor - 1) % 7) + 7) % 7;
  }
  let sum = 0;
  for (const char of roomNumber) sum += char.codePointAt(0) ?? 0;
  return sum % 7;
}

/** Ближайший день дежурства, начиная с сегодняшнего */
export function nextDutyDate(roomNumber: string, today: Date): Date {
  const shift = (dutyWeekday(roomNumber) - weekdayIndex(today) + 7) % 7;
  const next = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  next.setDate(next.getDate() + shift);
  return next;
}

/** Комендантский час: вход закрыт с 23:00 до 06:00 */
export const CURFEW_HOUR = 23;
export const OPEN_HOUR = 6;
/** За сколько часов до комендантского часа показывать напоминание */
export const CURFEW_WARN_HOURS = 2;

export type CurfewState = { kind: 'open' } | { kind: 'soon'; minutesLeft: number } | { kind: 'closed' };

export function curfewState(now: Date): CurfewState {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= CURFEW_HOUR * 60 || minutes < OPEN_HOUR * 60) return { kind: 'closed' };
  const left = CURFEW_HOUR * 60 - minutes;
  return left <= CURFEW_WARN_HOURS * 60 ? { kind: 'soon', minutesLeft: left } : { kind: 'open' };
}

/** «1 ч 20 мин», «45 мин», «2 ч» */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Локальная дата в виде ГГГГ-ММ-ДД */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Сколько дней от сегодня до даты ГГГГ-ММ-ДД (отрицательное — дата прошла) */
export function daysUntil(date: string, today: Date): number {
  const [y, m, d] = date.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** За сколько дней до окончания договора напоминать о продлении */
export const RENEW_WARN_DAYS = 30;

export interface DebtSummary {
  /** Остаток по неотменённым счетам, ₽ */
  remaining: number;
  /** Ближайший неоплаченный счёт по сроку */
  next: Invoice | null;
  overdue: number;
}

export function debtSummary(invoices: Invoice[]): DebtSummary {
  const open = invoices.filter((i) => i.status !== 'cancelled' && i.remainingAmount > 0);
  const kopecks = open.reduce((sum, i) => sum + Math.round(i.remainingAmount * 100), 0);
  const next = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  return { remaining: kopecks / 100, next, overdue: open.filter((i) => i.isOverdue).length };
}
