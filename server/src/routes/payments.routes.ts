/**
 * Маршруты платежей.
 *
 * Платежи неизменяемы: есть только запись и чтение, маршрутов изменения и удаления нет.
 * Администраторы читают и записывают платежи; студент читает только свои (GET /api/payments/my).
 */

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { ActionContext } from '../services/buildings.service.js';
import type { PaymentsService } from '../services/payments.service.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import { parseWithSchema } from '../validation/parse.js';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
} from '../validation/payments.validation.js';

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

export function createPaymentsRoutes(
  service: PaymentsService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate);

  /** GET /api/payments/my — платежи текущего студента (объявлен до /:id) */
  router.get('/my', async (req, res) => {
    res.json({ status: 'success', data: await service.listMine(requireUser(req).id) });
  });

  /** GET /api/payments — список; необязательный параметр ?invoiceId= */
  router.get('/', requireAdmin, async (req, res) => {
    const query = parseWithSchema(listPaymentsQuerySchema, req.query);
    const page = await service.list(query);
    res.json({
      status: 'success',
      data: page.items,
      meta: { total: page.total, limit: page.limit, offset: page.offset },
    });
  });

  /** POST /api/payments — записать платёж по счёту */
  router.post('/', requireAdmin, async (req, res) => {
    const input = parseWithSchema(createPaymentSchema, req.body);
    res.status(201).json({ status: 'success', data: await service.create(input, actionContext(req)) });
  });

  /** GET /api/payments/:id */
  router.get('/:id', requireAdmin, async (req, res) => {
    res.json({ status: 'success', data: await service.get(parseUuidParam(req.params.id)) });
  });

  return router;
}