/** Маршруты сводки: только чтение и только для администраторов */

import express from 'express';
import type { RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { DashboardService } from '../services/dashboard.service.js';

export function createDashboardRoutes(
  service: DashboardService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate, requireAdmin);

  /** GET /api/dashboard/summary */
  router.get('/summary', async (_req, res) => {
    res.json({ status: 'success', data: await service.summary() });
  });

  return router;
}