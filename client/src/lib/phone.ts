/** Телефон: всегда начинается с +7, показывается как «+7 900 123-45-67» */

const MAX_DIGITS = 10;

/**
 * Только цифры номера без кода страны (не более десяти).
 * Ввод с префиксом «+7» или «8» обрабатывается как код страны, а не как цифра номера.
 */
export function phoneDigits(input: string): string {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+7')) {
    digits = digits.slice(1);
  } else if (digits.length > MAX_DIGITS && (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, MAX_DIGITS);
}

/** Форматирование по мере ввода: «+7 », «+7 900 », «+7 900 123-45-67» */
export function formatPhone(input: string): string {
  const d = phoneDigits(input);
  let out = '+7 ';
  if (d.length > 0) out += d.slice(0, 3);
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

/** Номер полный: десять цифр после +7 */
export function isCompletePhone(value: string): boolean {
  return phoneDigits(value).length === MAX_DIGITS;
}

/** Значение для отправки: null, если цифр нет */
export function phoneToApi(value: string): string | null {
  return phoneDigits(value).length === 0 ? null : formatPhone(value);
}

/** Значение для формы из сохранённого: пустое даёт «+7 » */
export function phoneFromApi(value: string | null): string {
  return formatPhone(value ?? '');
}