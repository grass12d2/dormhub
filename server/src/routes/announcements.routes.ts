/** Маршруты объявлений: чтение и отметки у студента, управление у администратора */

import express from 'express';
import type { RequestHandler } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import type { AnnouncementsService } from '../services/announcements.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { parseUuidParam } from '../utils/params.js';
import {
    createAnnouncementSchema,
    listAnnouncementsQuerySchema,
    replaceAnnouncementSchema,
} from '../validation/announcements.validation.js';
import { parseWithSchema } from '../validation/parse.js';
import type { AnnouncementFilesService } from '../services/announcement-files.service.js';
import { MAX_FILE_BYTES } from '../utils/file-type.js';

export function createAnnouncementsRoutes(
    service: AnnouncementsService,
    files: AnnouncementFilesService,
    authenticate: RequestHandler
): express.Router {
    const router = express.Router();
    router.use(authenticate);

    const me = (req: express.Request) => {
        if (!req.user) {
            throw new UnauthorizedError('Требуется аутентификация');
        }
        return req.user;
    };

    /** GET /api/announcements — администратору все, студенту адресованные ему */
    router.get('/', async (req, res) => {
        const user = me(req);
        const query = parseWithSchema(listAnnouncementsQuerySchema, req.query);
        const page =
            user.role === 'admin' ? await service.listAll(user.id, query) : await service.listMine(user.id, query);
        res.json({
            status: 'success',
            data: page.items,
            meta: { total: page.total, limit: query.limit, offset: query.offset },
        });
    });

    /** GET /api/announcements/unread-count — число непрочитанных (студент) */
    router.get('/unread-count', async (req, res) => {
        const user = me(req);
        const count = user.role === 'admin' ? 0 : await service.unreadCount(user.id);
        res.json({ status: 'success', data: { count } });
    });

    /** POST /api/announcements/read-all — отметить все прочитанными (студент) */
    router.post('/read-all', async (req, res) => {
        const user = me(req);
        const marked = user.role === 'admin' ? 0 : await service.markAllRead(user.id);
        res.json({ status: 'success', data: { marked } });
    });

    /** POST /api/announcements/:id/read — отметить прочитанным */
    router.post('/:id/read', async (req, res) => {
        const user = me(req);
        const id = parseUuidParam(req.params.id);
        if (user.role === 'admin') {
            res.json({ status: 'success', data: { id } });
            return;
        }
        await service.markRead(id, user.id);
        res.json({ status: 'success', data: { id } });
    });

    /** POST /api/announcements — создать */
    router.post('/', requireAdmin, async (req, res) => {
        const user = me(req);
        const input = parseWithSchema(createAnnouncementSchema, req.body);
        const id = await service.create(input, { userId: user.id, ip: req.ip });
        res.status(201).json({ status: 'success', data: { id } });
    });

    /** PUT /api/announcements/:id — заменить текст, срок и адресатов */
    router.put('/:id', requireAdmin, async (req, res) => {
        const user = me(req);
        const id = parseUuidParam(req.params.id);
        const input = parseWithSchema(replaceAnnouncementSchema, req.body);
        await service.replace(id, input, { userId: user.id, ip: req.ip });
        res.json({ status: 'success', data: { id } });
    });

    /** DELETE /api/announcements/:id */
    router.delete('/:id', requireAdmin, async (req, res) => {
        const user = me(req);
        const id = parseUuidParam(req.params.id);
        await service.delete(id, { userId: user.id, ip: req.ip });
        res.json({ status: 'success', data: { id } });
    });

    /** POST /api/announcements/:id/files?name=… — тело запроса: сам файл (до 5 МБ) */
    router.post(
        '/:id/files',
        requireAdmin,
        express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
        async (req, res) => {
            const user = me(req);
            const id = parseUuidParam(req.params.id);
            const name = typeof req.query.name === 'string' ? req.query.name : '';
            const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
            const info = await files.upload(id, name, body, { userId: user.id, ip: req.ip });
            res.status(201).json({ status: 'success', data: info });
        }
    );

    /** GET /api/announcements/:id/files/:fileId — скачивание */
    router.get('/:id/files/:fileId', async (req, res) => {
        const user = me(req);
        const file = await files.download(parseUuidParam(req.params.id), parseUuidParam(req.params.fileId), user);
        res
            .set('Content-Type', file.contentType)
            .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
            .set('X-Content-Type-Options', 'nosniff')
            .set('Cache-Control', 'private, no-store')
            .send(file.data);
    });

    /** DELETE /api/announcements/:id/files/:fileId */
    router.delete('/:id/files/:fileId', requireAdmin, async (req, res) => {
        const user = me(req);
        const id = parseUuidParam(req.params.id);
        await files.remove(id, parseUuidParam(req.params.fileId), { userId: user.id, ip: req.ip });
        res.json({ status: 'success', data: { id } });
    });

    return router;
}