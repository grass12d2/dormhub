/** Одноразовые коды восстановления пароля: генерация, хеш и сравнение */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const RESET_CODE_LENGTH = 6;
export const RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const RESET_MAX_ATTEMPTS = 5;

/** Шесть цифр, включая ведущие нули */
export function generateResetCode(): string {
  return String(randomInt(0, 10 ** RESET_CODE_LENGTH)).padStart(RESET_CODE_LENGTH, '0');
}

/** HMAC-SHA256 в hex: 64 символа. Секрет не даёт подобрать код по утёкшей базе без него */
export function hashResetCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}

/** Сравнение за постоянное время; код неверного формата отклоняется сразу */
export function verifyResetCode(code: string, expectedHash: string, secret: string): boolean {
  if (!new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`).test(code)) {
    return false;
  }
  const actual = Buffer.from(hashResetCode(code, secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}