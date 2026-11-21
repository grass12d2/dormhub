/**
 * Выпуск и проверка JWT.
 * Алгоритм зафиксирован (HS256), проверяются издатель и форма содержимого.
 */

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { UserRole } from '../types/auth.js';
import { UnauthorizedError } from './errors.js';

export const TOKEN_ISSUER = 'dormhub-api';

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

const payloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(['admin', 'student']),
});

export function signAccessToken(payload: TokenPayload, secret: string, ttlSeconds: number): string {
  return jwt.sign({ role: payload.role }, secret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
    issuer: TOKEN_ISSUER,
    subject: payload.userId,
  });
}

/**
 * Проверить токен. При любой проблеме выбрасывает UnauthorizedError (HTTP 401).
 */
export function verifyAccessToken(token: string, secret: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
    });
    const payload = payloadSchema.parse(decoded);
    return { userId: payload.sub, role: payload.role };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Срок действия сессии истёк. Войдите снова');
    }
    throw new UnauthorizedError('Недействительный токен');
  }
}