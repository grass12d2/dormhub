/**
 * Маршруты аутентификации.
 */

import express from 'express';
import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { signChallenge, verifyChallenge } from '../services/login-challenge.js';
import type { PasswordResetService } from '../services/password-reset.service.js';
import type { TwoFactorService } from '../services/two-factor.service.js';
import { BadRequestError, UnauthorizedError } from '../utils/errors.js';
import {
  forgotPasswordSchema,
  loginSchema,
  loginTwoFactorSchema,
  resetPasswordSchema,
} from '../validation/auth.validation.js';

export function createAuthRoutes(
  authService: AuthService,
  passwordReset: PasswordResetService,
  twoFactor: TwoFactorService,
  jwtSecret: string,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  /** POST /api/auth/login — вход по email и паролю; при включённой 2FA нужен второй шаг */
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
    if (await twoFactor.isEnabled(result.user.id)) {
      // Пароль верен, но настоящий токен выдаётся только после второго шага
      res.json({
        status: 'success',
        data: { twoFactorRequired: true, challengeToken: signChallenge(result.user.id, jwtSecret) },
      });
      return;
    }
    res.json({ status: 'success', data: result });
  });

  /** POST /api/auth/login/2fa — второй шаг входа: код из приложения или код восстановления */
  router.post('/login/2fa', async (req, res) => {
    const parsed = loginTwoFactorSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Укажите код подтверждения');
    }
    const userId = verifyChallenge(parsed.data.challengeToken, jwtSecret);
    if (!(await twoFactor.verifyLoginCode(userId, parsed.data.code))) {
      throw new UnauthorizedError('Неверный код');
    }
    res.json({ status: 'success', data: await authService.issueSession(userId) });
  });

  /** GET /api/auth/me — текущий пользователь по токену */
  router.get('/me', authenticate, (req, res) => {
    res.json({ status: 'success', data: { user: req.user } });
  });

  /** POST /api/auth/forgot-password — выслать код на email (ответ всегда одинаков) */
  router.post('/forgot-password', async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Укажите корректный email');
    }
    const message = await passwordReset.requestCode(parsed.data.email, req.ip ?? 'unknown');
    res.json({ status: 'success', data: { message } });
  });

  /** POST /api/auth/reset-password — сменить пароль по коду */
  router.post('/reset-password', async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Укажите email, шестизначный код и новый пароль');
    }
    await passwordReset.reset(
      parsed.data.email,
      parsed.data.code,
      parsed.data.newPassword,
      req.ip ?? 'unknown'
    );
    res.json({ status: 'success', data: { changed: true } });
  });

  return router;
}