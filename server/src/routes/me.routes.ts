/** Маршруты текущего пользователя */

import express from 'express';
import type { RequestHandler } from 'express';
import type { ResidenceService } from '../services/residence.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export function createMeRoutes(service: ResidenceService, authenticate: RequestHandler): express.Router {
  const router = express.Router();
  router.use(authenticate);

  /** GET /api/me/residence — действующее проживание (data: null, если его нет) */
  router.get('/residence', async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedError('Требуется аутентификация');
    }
    res.json({ status: 'success', data: await service.getMine(req.user.id) });
  });

  return router;
}