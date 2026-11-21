/**
 * Политика паролей и хеширование bcrypt.
 */

import bcrypt from 'bcrypt';

export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt учитывает только первые 72 байта пароля */
export const MAX_PASSWORD_BYTES = 72;
export const DEFAULT_BCRYPT_ROUNDS = 12;

/** Проверить пароль по политике. Возвращает сообщение об ошибке или null */
export function validatePasswordPolicy(password: string): string | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Пароль слишком длинный: не более ${MAX_PASSWORD_BYTES} байт`;
  }
  return null;
}

export function hashPassword(password: string, rounds = DEFAULT_BCRYPT_ROUNDS): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Пароли длиннее 72 байт при создании запрещены, поэтому такой пароль заведомо неверный.
  // Сравнение всё равно выполняется, чтобы время ответа не отличалось.
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    await bcrypt.compare('', hash);
    return false;
  }
  return bcrypt.compare(password, hash);
}