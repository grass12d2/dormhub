/**
 * Маршруты аутентификации.
 */

import express from 'express';
import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { BadRequestError } from '../utils/errors.js';
import { loginSchema } from '../validation/auth.validation.js';

export function createAuthRoutes(
  authService: AuthService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  /** POST /api/auth/login — вход по email и паролю */
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Укажите корректные email и пароль');
    }

    const result = await authService.login(
      parsed.data.email,
      parsed.data.password,
      req.ip ?? 'unknown'
    );
    res.json({ status: 'success', data: result });
  });

  /** GET /api/auth/me — текущий пользователь по токену */
  router.get('/me', authenticate, (req, res) => {
    res.json({ status: 'success', data: { user: req.user } });
  });

  return router;
}