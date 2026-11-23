/** Проверка форм восстановления пароля в браузере; сервер проверяет повторно */

import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './passwordForm';

export function validateEmail(email: string): string | null {
  return /^\S+@\S+\.\S+$/.test(email.trim()) ? null : 'Введите корректный email';
}

export function validatePasswords(next: string, repeat: string): { next?: string; repeat?: string } {
  const errors: { next?: string; repeat?: string } = {};
  if ([...next].length < MIN_PASSWORD_LENGTH) {
    errors.next = `Не короче ${MIN_PASSWORD_LENGTH} символов`;
  } else if (new TextEncoder().encode(next).length > MAX_PASSWORD_BYTES) {
    errors.next = `Слишком длинный пароль: не более ${MAX_PASSWORD_BYTES} байт`;
  }
  if (repeat !== next) {
    errors.repeat = 'Пароли не совпадают';
  }
  return errors;
}