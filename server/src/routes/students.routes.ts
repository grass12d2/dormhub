/**
 * Маршруты студентов.
 *
 * Администраторы управляют всеми записями. Студент может прочитать только
 * собственный профиль (GET /api/students/me).
 */

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { ActionContext } from '../services/buildings.service.js';
import type { StudentsService } from '../services/students.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import { parseWithSchema } from '../validation/parse.js';
import {
  createStudentSchema,
  listStudentsQuerySchema,
  patchStudentSchema,
  replaceStudentSchema,
} from '../validation/students.validation.js';

/** Автор и адрес клиента для журнала аудита */
function actionContext(req: Request): ActionContext {
  if (!req.user) {
    throw new UnauthorizedError('Требуется аутентификация');
  }
  return { userId: req.user.id, ip: req.ip };
}

export function createStudentsRoutes(
  service: StudentsService,
  authenticate: RequestHandler
): express.Router {
  const router = express.Router();

  router.use(authenticate);

  /** GET /api/students/me — собственный профиль (маршрут объявлен до /:id) */
  router.get('/me', async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedError('Требуется аутентификация');
    }
    res.json({ status: 'success', data: await service.getByUserId(req.user.id) });
  });

  /** GET /api/students — список с поиском и постраничным выводом */
  router.get('/', requireAdmin, async (req, res) => {
    const query = parseWithSchema(listStudentsQuerySchema, req.query);
    const page = await service.list(query);
    res.json({
      status: 'success',
      data: page.items,
      meta: { total: page.total, limit: page.limit, offset: page.offset },
    });
  });

  /** POST /api/students — создать студента (по желанию с учётной записью) */
  router.post('/', requireAdmin, async (req, res) => {
    const input = parseWithSchema(createStudentSchema, req.body);
    const student = await service.create(input, actionContext(req));
    res.status(201).json({ status: 'success', data: student });
  });

  /** GET /api/students/:id */
  router.get('/:id', requireAdmin, async (req, res) => {
    res.json({ status: 'success', data: await service.get(parseUuidParam(req.params.id)) });
  });

  /** PUT /api/students/:id — полная замена */
  router.put('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(replaceStudentSchema, req.body);
    res.json({ status: 'success', data: await service.replace(id, input, actionContext(req)) });
  });

  /** PATCH /api/students/:id — частичное изменение */
  router.patch('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    const input = parseWithSchema(patchStudentSchema, req.body);
    res.json({ status: 'success', data: await service.patch(id, input, actionContext(req)) });
  });

  /** DELETE /api/students/:id */
  router.delete('/:id', requireAdmin, async (req, res) => {
    const id = parseUuidParam(req.params.id);
    await service.delete(id, actionContext(req));
    res.json({ status: 'success', data: { id } });
  });

  return router;
}