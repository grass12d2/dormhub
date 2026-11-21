/**
 * Проверка аутентификации и ролей.
 */

import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { UserRole } from '../types/auth.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/** Достать токен из заголовка Authorization: Bearer <токен> */
function extractBearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

/** Проверить токен и записать пользователя в req.user */
export function createAuthenticate(authService: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedError('Требуется аутентификация');
    }
    req.user = await authService.authenticate(token);
    next();
  };
}

/** Разрешить доступ только указанным ролям; используется после authenticate */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Требуется аутентификация');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Недостаточно прав для выполнения операции');
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');