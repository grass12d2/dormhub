/** Пользователь, вошедший в систему, и разбор ответа сервера */

export type Role = 'admin' | 'student';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * Разбирает пользователя из ответа сервера: принимает и сам объект,
 * и объект вида { user: {...} }. Неверная форма даёт null.
 */
export function parseUser(value: unknown): AuthUser | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const candidate =
    typeof record.user === 'object' && record.user !== null
      ? (record.user as Record<string, unknown>)
      : record;
  const { id, email, role } = candidate;
  if (typeof id === 'string' && typeof email === 'string' && (role === 'admin' || role === 'student')) {
    return { id, email, role };
  }
  return null;
}