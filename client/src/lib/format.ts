/** Форматирование чисел, денег и дат для интерфейса (русская локаль) */

const NUMBER = new Intl.NumberFormat('ru-RU');
const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});
const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatNumber = (value: number): string => NUMBER.format(value);
export const formatMoney = (value: number): string => MONEY.format(value);

/** Дата и время из строки ISO; неверное значение даёт «—» */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date);
}

/** Доля в процентах, округлённая до целого; при нулевом знаменателе 0 */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}