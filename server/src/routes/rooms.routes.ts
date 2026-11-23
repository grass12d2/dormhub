/**
 * Маршруты комнат.
 *
 * Читать могут все аутентифицированные пользователи,
 * изменять — только администраторы.
 */
// Все операции доступны только администраторам.

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { ActionContext } from '../services/buildings.service.js';
import type { RoomsService } from '../services/rooms.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import { parseWithSchema } from '../validation/parse.js';
import {
  createRoomSchema,
  listRoomsQuerySchema,
  patchRoomSchema,
  replaceRoomSchema,
} from '../validation/rooms.validation.js';

/** Автор и адрес клиента для журнала аудита */
function actionContext(req: Request): ActionContext {
  if (!req.user) {
    throw new UnauthorizedError('Требуется аутентификация');
  }
  return { userId: req.user.id, ip: req.ip };
}

export function createRoomsRoutes(
  service: RoomsService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate, requireAdmin);

  /** GET /api/rooms — список комнат; необязательный параметр ?buildingId= */
  router.get('/', async (req, res) => {
    const query = parseWithSchema(listRoomsQuerySchema, req.query);
    res.json({ status: 'success', data: await service.list(query.buildingId) });
  });

  /** POST /api/rooms — создать комнату */
  router.post('/', requireAdmin, async (req, res) => {
    const input = parseWithSchema(createRoomSchema, req.body);
    const room = await service.create(input, actionContext(req));
    res.status(201).json({ status: 'success', data: room });
  });

  /** GET /api/rooms/:id — комната по идентификатору */
  router.get('/:id', async (req, res) => {
    const room = await service.get(parseUuidParam(req.params.id));
    res.json({ status: 'success', data: room });
  });

  /** PUT /api/rooms/:id — полная замена */
  router.put('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(replaceRoomSchema, req.body);
    const room = await service.replace(id, input, actionContext(req));
    res.json({ status: 'success', data: room });
  });

  /** PATCH /api/rooms/:id — частичное изменение */
  router.patch('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(patchRoomSchema, req.body);
    const room = await service.patch(id, input, actionContext(req));
    res.json({ status: 'success', data: room });
  });

  /** DELETE /api/rooms/:id — удалить комнату */
  router.delete('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    await service.delete(id, actionContext(req));
    res.json({ status: 'success', data: { id } });
  });

  return router;
}