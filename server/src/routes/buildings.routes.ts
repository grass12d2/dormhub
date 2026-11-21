/**
 * Маршруты зданий и их сотрудников.
 *
 * Читать могут все аутентифицированные пользователи,
 * изменять — только администраторы.
 */

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { ActionContext, BuildingsService } from '../services/buildings.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import {
  createBuildingSchema,
  createStaffSchema,
  patchBuildingSchema,
  patchStaffSchema,
  replaceBuildingSchema,
  replaceStaffSchema,
} from '../validation/buildings.validation.js';
import { parseWithSchema } from '../validation/parse.js';

/** Автор и адрес клиента для журнала аудита */
function actionContext(req: Request): ActionContext {
  if (!req.user) {
    throw new UnauthorizedError('Требуется аутентификация');
  }
  return { userId: req.user.id, ip: req.ip };
}

export function createBuildingsRoutes(
  service: BuildingsService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate);

  /** GET /api/buildings — список зданий */
  router.get('/', async (_req, res) => {
    res.json({ status: 'success', data: await service.list() });
  });

  /** POST /api/buildings — создать здание */
  router.post('/', requireAdmin, async (req, res) => {
    const input = parseWithSchema(createBuildingSchema, req.body);
    const building = await service.create(input, actionContext(req));
    res.status(201).json({ status: 'success', data: building });
  });

  /** GET /api/buildings/:id — здание по идентификатору */
  router.get('/:id', async (req, res) => {
    const building = await service.get(parseUuidParam(req.params.id));
    res.json({ status: 'success', data: building });
  });

  /** PUT /api/buildings/:id — полная замена */
  router.put('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(replaceBuildingSchema, req.body);
    const building = await service.replace(id, input, actionContext(req));
    res.json({ status: 'success', data: building });
  });

  /** PATCH /api/buildings/:id — частичное изменение */
  router.patch('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(patchBuildingSchema, req.body);
    const building = await service.patch(id, input, actionContext(req));
    res.json({ status: 'success', data: building });
  });

  /** DELETE /api/buildings/:id — удалить здание */
  router.delete('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    await service.delete(id, actionContext(req));
    res.json({ status: 'success', data: { id } });
  });

  /** GET /api/buildings/:id/staff — сотрудники здания */
  router.get('/:id/staff', async (req, res) => {
    const staff = await service.listStaff(parseUuidParam(req.params.id));
    res.json({ status: 'success', data: staff });
  });

  /** POST /api/buildings/:id/staff — добавить сотрудника */
  router.post('/:id/staff', requireAdmin, async (req, res) => {
    const buildingId = parseUuidParam(req.params.id);
    const input = parseWithSchema(createStaffSchema, req.body);
    const member = await service.createStaff(buildingId, input, actionContext(req));
    res.status(201).json({ status: 'success', data: member });
  });

  /** PUT /api/buildings/:id/staff/:staffId — полная замена */
  router.put('/:id/staff/:staffId', requireAdmin, async (req, res) => {
    const buildingId = parseUuidParam(req.params.id);
    const staffId = parseUuidParam(req.params.staffId);
    const input = parseWithSchema(replaceStaffSchema, req.body);
    const member = await service.replaceStaff(buildingId, staffId, input, actionContext(req));
    res.json({ status: 'success', data: member });
  });

  /** PATCH /api/buildings/:id/staff/:staffId — частичное изменение */
  router.patch('/:id/staff/:staffId', requireAdmin, async (req, res) => {
    const buildingId = parseUuidParam(req.params.id);
    const staffId = parseUuidParam(req.params.staffId);
    const input = parseWithSchema(patchStaffSchema, req.body);
    const member = await service.patchStaff(buildingId, staffId, input, actionContext(req));
    res.json({ status: 'success', data: member });
  });

  /** DELETE /api/buildings/:id/staff/:staffId — удалить сотрудника */
  router.delete('/:id/staff/:staffId', requireAdmin, async (req, res) => {
    const buildingId = parseUuidParam(req.params.id);
    const staffId = parseUuidParam(req.params.staffId);
    await service.deleteStaff(buildingId, staffId, actionContext(req));
    res.json({ status: 'success', data: { id: staffId } });
  });

  return router;
}