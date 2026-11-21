/**
 * Типы аутентификации и авторизации.
 */

export type UserRole = 'admin' | 'student';

/** Пользователь, проверенный по токену и по базе данных */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Заполняется middleware authenticate */
      user?: AuthenticatedUser;
    }
  }
}