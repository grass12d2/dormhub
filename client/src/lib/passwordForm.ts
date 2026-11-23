/** Проверка формы смены пароля в браузере; сервер проверяет повторно */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 72;

export interface PasswordFormValues {
  current: string;
  next: string;
  repeat: string;
}
export type PasswordFormErrors = Partial<Record<keyof PasswordFormValues, string>>;

export const EMPTY_PASSWORD_FORM: PasswordFormValues = { current: '', next: '', repeat: '' };

export function validatePasswordForm(v: PasswordFormValues): PasswordFormErrors {
  const errors: PasswordFormErrors = {};
  if (!v.current) {
    errors.current = 'Введите текущий пароль';
  }
  if ([...v.next].length < MIN_PASSWORD_LENGTH) {
    errors.next = `Не короче ${MIN_PASSWORD_LENGTH} символов`;
  } else if (new TextEncoder().encode(v.next).length > MAX_PASSWORD_BYTES) {
    errors.next = `Слишком длинный пароль: не более ${MAX_PASSWORD_BYTES} байт`;
  } else if (v.next === v.current) {
    errors.next = 'Новый пароль должен отличаться от текущего';
  }
  if (v.repeat !== v.next) {
    errors.repeat = 'Пароли не совпадают';
  }
  return errors;
}