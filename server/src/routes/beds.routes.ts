/**
 * Маршруты коек.
 *
 * Читать могут все аутентифицированные пользователи,
 * изменять — только администраторы.
 */

import express from 'express';
import type { Request, RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { BedsService } from '../services/beds.service.js';
import type { ActionContext } from '../services/buildings.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import {
    createBedSchema,
    listBedsQuerySchema,
    patchBedSchema,
    replaceBedSchema,
} from '../validation/beds.validation.js';
import { parseWithSchema } from '../validation/parse.js';

/** Автор и адрес клиента для журнала аудита */
function actionContext(req: Request): ActionContext {
    if (!req.user) {
        throw new UnauthorizedError('Требуется аутентификация');
    }
    return { userId: req.user.id, ip: req.ip };
}

export function createBedsRoutes(service: BedsService, authenticate: RequestHandler): express.Router {
    const router = express.Router();

    router.use(authenticate, requireAdmin);

    /** GET /api/beds — список коек; необязательный параметр ?roomId= */
    router.get('/', async (req, res) => {
        const query = parseWithSchema(listBedsQuerySchema, req.query);
        res.json({ status: 'success', data: await service.list(query.roomId) });
    });

    /** POST /api/beds — создать койку */
    router.post('/', requireAdmin, async (req, res) => {
        const input = parseWithSchema(createBedSchema, req.body);
        const bed = await service.create(input, actionContext(req));
        res.status(201).json({ status: 'success', data: bed });
    });

    /** GET /api/beds/:id — койка по идентификатору */
    router.get('/:id', async (req, res) => {
        res.json({ status: 'success', data: await service.get(parseUuidParam(req.params.id)) });
    });

    /** PUT /api/beds/:id — полная замена номера и статуса */
    router.put('/:id', requireAdmin, async (req, res) => {
        const id = parseUuidParam(req.params.id);
        const input = parseWithSchema(replaceBedSchema, req.body);
        res.json({ status: 'success', data: await service.replace(id, input, actionContext(req)) });
    });

    /** PATCH /api/beds/:id — частичное изменение */
    router.patch('/:id', requireAdmin, async (req, res) => {
        const id = parseUuidParam(req.params.id);
        const input = parseWithSchema(patchBedSchema, req.body);
        res.json({ status: 'success', data: await service.patch(id, input, actionContext(req)) });
    });

    /** DELETE /api/beds/:id — удалить койку */
    router.delete('/:id', requireAdmin, async (req, res) => {
        const id = parseUuidParam(req.params.id);
        await service.delete(id, actionContext(req));
        res.json({ status: 'success', data: { id } });
    });

    return router;
}