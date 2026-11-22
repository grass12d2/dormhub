/**
 * Маршруты счетов.
 *
 * Администраторы управляют счетами. Студент читает только свои:
 * GET /api/invoices/my и GET /api/invoices/:id. Удаления нет: счёт можно отменить.
 */

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { ActionContext } from '../services/buildings.service.js';
import type { InvoicesService } from '../services/invoices.service.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  patchInvoiceSchema,
} from '../validation/invoices.validation.js';
import { parseWithSchema } from '../validation/parse.js';

function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new UnauthorizedError('Требуется аутентификация');
  }
  return req.user;
}

/** Автор и адрес клиента для журнала аудита */
function actionContext(req: Request): ActionContext {
  return { userId: requireUser(req).id, ip: req.ip };
}

export function createInvoicesRoutes(
  service: InvoicesService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate);

  /** GET /api/invoices/my — счета текущего студента (объявлен до /:id) */
  router.get('/my', async (req, res) => {
    res.json({ status: 'success', data: await service.listMine(requireUser(req).id) });
  });

  /** GET /api/invoices — список с фильтрами и постраничным выводом */
  router.get('/', requireAdmin, async (req, res) => {
    const query = parseWithSchema(listInvoicesQuerySchema, req.query);
    const page = await service.list(query);
    res.json({
      status: 'success',
      data: page.items,
      meta: { total: page.total, limit: page.limit, offset: page.offset },
    });
  });

  /** POST /api/invoices — выставить счёт по договору */
  router.post('/', requireAdmin, async (req, res) => {
    const input = parseWithSchema(createInvoiceSchema, req.body);
    res.status(201).json({ status: 'success', data: await service.create(input, actionContext(req)) });
  });

  /** GET /api/invoices/:id */
  router.get('/:id', async (req, res) => {
    const invoice = await service.get(parseUuidParam(req.params.id), requireUser(req));
    res.json({ status: 'success', data: invoice });
  });

  /** PATCH /api/invoices/:id — описание и срок оплаты */
  router.patch('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(patchInvoiceSchema, req.body);
    res.json({ status: 'success', data: await service.patch(id, input, actionContext(req)) });
  });

  /** POST /api/invoices/:id/cancel — отменить счёт без платежей */
  router.post('/:id/cancel', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    res.json({ status: 'success', data: await service.cancel(id, actionContext(req)) });
  });

  return router;
}