/**
 * Маршруты журнала аудита: только чтение и только для администраторов.
 */

import express from 'express';
import type { RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { AuditLogsService } from '../services/audit-logs.service.js';
import { listAuditLogsQuerySchema, parseAuditLogId } from '../validation/audit.validation.js';
import { parseWithSchema } from '../validation/parse.js';

export function createAuditLogsRoutes(
  service: AuditLogsService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate, requireAdmin);

  /** GET /api/audit-logs — список с фильтрами, новые записи первыми */
  router.get('/', async (req, res) => {
    const query = parseWithSchema(listAuditLogsQuerySchema, req.query);
    const page = await service.list(query);
    res.json({
      status: 'success',
      data: page.items,
      meta: { total: page.total, limit: page.limit, offset: page.offset },
    });
  });

  /** GET /api/audit-logs/:id */
  router.get('/:id', async (req, res) => {
    res.json({ status: 'success', data: await service.get(parseAuditLogId(req.params.id)) });
  });

  return router;
}