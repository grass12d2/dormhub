/** Короткоживущий токен «пароль принят, нужен второй шаг»; подписан отдельным ключом */

import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors.js';

const TTL_SECONDS = 5 * 60;

const keyOf = (secret: string) => `${secret}:2fa-challenge`;

export function signChallenge(userId: string, secret: string): string {
  return jwt.sign({ purpose: '2fa' }, keyOf(secret), {
    algorithm: 'HS256',
    expiresIn: TTL_SECONDS,
    subject: userId,
    issuer: 'dormhub-2fa',
  });
}

export function verifyChallenge(token: string, secret: string): string {
  try {
    const decoded = jwt.verify(token, keyOf(secret), {
      algorithms: ['HS256'],
      issuer: 'dormhub-2fa',
    });
    if (typeof decoded === 'string' || decoded.purpose !== '2fa' || !decoded.sub) {
      throw new Error('bad');
    }
    return decoded.sub;
  } catch {
    throw new UnauthorizedError('Время подтверждения истекло. Войдите снова');
  }
}