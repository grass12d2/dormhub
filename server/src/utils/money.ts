/**
 * Денежные суммы в копейках.
 *
 * Все сравнения сумм выполняются над целыми числами копеек: числа с плавающей точкой
 * дают погрешность (0,1 + 0,1 + 0,1 не равно 0,3).
 */

/** Сумма в копейках: принимает число или строку numeric из базы данных («700.00») */
export function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

/** Копейки в строку с двумя знаками после запятой: 60000 → «600.00» */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}