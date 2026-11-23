/** Маршруты учётной записи текущего пользователя */

import express from 'express';
import type { RequestHandler } from 'express';
import type { AccountService } from '../services/account.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { changePasswordSchema } from '../validation/account.validation.js';
import { parseWithSchema } from '../validation/parse.js';

export function createAccountRoutes(
  service: AccountService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();
  router.use(authenticate);

  /** POST /api/account/password — сменить свой пароль */
  router.post('/password', async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedError('Требуется аутентификация');
    }
    const input = parseWithSchema(changePasswordSchema, req.body);
    await service.changePassword(input, { userId: req.user.id, ip: req.ip });
    res.json({ status: 'success', data: { changed: true } });
  });

  return router;
}