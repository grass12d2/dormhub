/**
 * Маршруты договоров.
 *
 * Администраторы управляют договорами. Студент читает только свои:
 * GET /api/contracts/my и GET /api/contracts/:id.
 */

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { ActionContext } from '../services/buildings.service.js';
import type { ContractsService } from '../services/contracts.service.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import {
  createContractSchema,
  listContractsQuerySchema,
  patchContractSchema,
  terminateContractSchema,
} from '../validation/contracts.validation.js';
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

export function createContractsRoutes(
  service: ContractsService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate);

  /** GET /api/contracts/my — договоры текущего студента (объявлен до /:id) */
  router.get('/my', async (req, res) => {
    res.json({ status: 'success', data: await service.listMine(requireUser(req).id) });
  });

  /** GET /api/contracts — список с фильтрами и постраничным выводом */
  router.get('/', requireAdmin, async (req, res) => {
    const query = parseWithSchema(listContractsQuerySchema, req.query);
    const page = await service.list(query);
    res.json({
      status: 'success',
      data: page.items,
      meta: { total: page.total, limit: page.limit, offset: page.offset },
    });
  });

  /** POST /api/contracts — оформить договор (статус pending) */
  router.post('/', requireAdmin, async (req, res) => {
    const input = parseWithSchema(createContractSchema, req.body);
    res.status(201).json({ status: 'success', data: await service.create(input, actionContext(req)) });
  });

  /** GET /api/contracts/:id */
  router.get('/:id', async (req, res) => {
    const contract = await service.get(parseUuidParam(req.params.id), requireUser(req));
    res.json({ status: 'success', data: contract });
  });

  /** PATCH /api/contracts/:id — даты и ставка (только для договора в статусе pending) */
  router.patch('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(patchContractSchema, req.body);
    res.json({ status: 'success', data: await service.patch(id, input, actionContext(req)) });
  });

  /** POST /api/contracts/:id/activate — pending → active */
  router.post('/:id/activate', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    res.json({ status: 'success', data: await service.activate(id, actionContext(req)) });
  });

  /** POST /api/contracts/:id/cancel — pending → cancelled */
  router.post('/:id/cancel', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    res.json({ status: 'success', data: await service.cancel(id, actionContext(req)) });
  });

  /** POST /api/contracts/:id/terminate — active → terminated, причина необязательна */
  router.post('/:id/terminate', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(terminateContractSchema, req.body ?? {});
    res.json({
      status: 'success',
      data: await service.terminate(id, input.reason, actionContext(req)),
    });
  });

  /** POST /api/contracts/:id/expire — active → expired, если срок истёк */
  router.post('/:id/expire', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    res.json({ status: 'success', data: await service.expire(id, actionContext(req)) });
  });

  return router;
}