/** Маршруты учётной записи текущего пользователя */

import express from 'express';
import type { RequestHandler } from 'express';
import type { AccountService } from '../services/account.service.js';
import type { ProfileService } from '../services/profile.service.js';
import { UnauthorizedError, UnprocessableError } from '../utils/errors.js';
import {
  changeEmailSchema,
  changePasswordSchema,
  patchProfileSchema,
} from '../validation/account.validation.js';
import { parseWithSchema } from '../validation/parse.js';
import { MAX_AVATAR_BYTES } from '../utils/image.js';

export function createAccountRoutes(
  service: AccountService,
  profiles: ProfileService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();
  router.use(authenticate);

  const user = (req: express.Request) => {
    if (!req.user) {
      throw new UnauthorizedError('Требуется аутентификация');
    }
    return req.user;
  };

  /** POST /api/account/password — сменить свой пароль */
  router.post('/password', async (req, res) => {
    const me = user(req);
    const input = parseWithSchema(changePasswordSchema, req.body);
    await service.changePassword(input, { userId: me.id, ip: req.ip });
    res.json({ status: 'success', data: { changed: true } });
  });

  /** GET /api/account/profile */
  router.get('/profile', async (req, res) => {
    res.json({ status: 'success', data: await profiles.get(user(req).id) });
  });

  /** PATCH /api/account/profile */
  router.patch('/profile', async (req, res) => {
    const me = user(req);
    const input = parseWithSchema(patchProfileSchema, req.body);
    await profiles.patch(input, me.role, { userId: me.id, ip: req.ip });
    res.json({ status: 'success', data: await profiles.get(me.id) });
  });

  /** POST /api/account/email — сменить email (нужен текущий пароль) */
  router.post('/email', async (req, res) => {
    const me = user(req);
    const input = parseWithSchema(changeEmailSchema, req.body);
    await profiles.changeEmail(input, { userId: me.id, ip: req.ip });
    res.json({ status: 'success', data: await profiles.get(me.id) });
  });

  /** GET /api/account/avatar — изображение или 404 */
  router.get('/avatar', async (req, res) => {
    const avatar = await profiles.getAvatar(user(req).id);
    if (!avatar) {
      res.status(404).json({ status: 'error', message: 'Аватар не задан' });
      return;
    }
    res.set('Content-Type', avatar.type).set('Cache-Control', 'private, no-cache').send(avatar.data);
  });

  /** PUT /api/account/avatar — тело запроса: само изображение (до 2 МБ) */
  router.put(
    '/avatar',
    express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: MAX_AVATAR_BYTES }),
    async (req, res) => {
      const me = user(req);
      if (!Buffer.isBuffer(req.body)) {
        throw new UnprocessableError('Отправьте изображение PNG, JPEG или WebP');
      }
      await profiles.setAvatar(req.body, { userId: me.id, ip: req.ip });
      res.json({ status: 'success', data: { hasAvatar: true } });
    }
  );

  /** DELETE /api/account/avatar */
  router.delete('/avatar', async (req, res) => {
    const me = user(req);
    await profiles.deleteAvatar({ userId: me.id, ip: req.ip });
    res.json({ status: 'success', data: { hasAvatar: false } });
  });

  return router;
}