/** Маршруты чата */

import express from 'express';
import type { RequestHandler } from 'express';
import type { ChatService } from '../services/chat.service.js';
import { BadRequestError, UnauthorizedError } from '../utils/errors.js';
import {
    blockSchema,
    messagesQuerySchema,
    openDirectSchema,
    peopleQuerySchema,
    reactionSchema,
    sendMessageSchema,
} from '../validation/chat.validation.js';
import { parseWithSchema } from '../validation/parse.js';
import type { ChatFilesService } from '../services/chat-files.service.js';
import { MAX_CHAT_FILE_BYTES } from '../utils/file-type.js';
import { parseUuidParam } from '../utils/params.js';

function intParam(value: unknown): number {
    if (typeof value !== 'string' || !/^\d{1,15}$/.test(value) || Number(value) < 1) {
        throw new BadRequestError('Некорректный идентификатор');
    }
    return Number(value);
}

export function createChatRoutes(
    service: ChatService,
    files: ChatFilesService,
    authenticate: RequestHandler
): express.Router {
    const router = express.Router();
    router.use(authenticate);

    const me = (req: express.Request) => {
        if (!req.user) throw new UnauthorizedError('Требуется аутентификация');
        return req.user;
    };

    router.get('/', async (req, res) => {
        res.json({ status: 'success', data: await service.list(me(req)) });
    });

    router.get('/unread-count', async (req, res) => {
        res.json({ status: 'success', data: { count: await service.totalUnread(me(req)) } });
    });

    router.post('/read-all', async (req, res) => {
        await service.markAllRead(me(req));
        res.json({ status: 'success', data: { read: true } });
    });

    router.get('/people', async (req, res) => {
        const q = parseWithSchema(peopleQuerySchema, req.query);
        res.json({ status: 'success', data: await service.people(me(req), q.q) });
    });

    router.post('/direct', async (req, res) => {
        const input = parseWithSchema(openDirectSchema, req.body);
        res.json({ status: 'success', data: { id: await service.openDirect(me(req), input.userId) } });
    });

    router.post('/blocks', async (req, res) => {
        const input = parseWithSchema(blockSchema, req.body);
        await service.block(me(req), input.userId);
        res.json({ status: 'success', data: { blocked: true } });
    });

    router.delete('/blocks/:userId', async (req, res) => {
        await service.unblock(me(req), String(req.params.userId));
        res.json({ status: 'success', data: { blocked: false } });
    });

    router.get('/:id/messages', async (req, res) => {
        const q = parseWithSchema(messagesQuerySchema, req.query);
        res.json({ status: 'success', data: await service.messages(intParam(req.params.id), me(req), q) });
    });

    router.post('/:id/messages', async (req, res) => {
        const input = parseWithSchema(sendMessageSchema, req.body);
        const id = await service.send(intParam(req.params.id), me(req), input);
        res.status(201).json({ status: 'success', data: { id } });
    });

    router.post('/:id/read', async (req, res) => {
        await service.markRead(intParam(req.params.id), me(req));
        res.json({ status: 'success', data: { read: true } });
    });

    router.put('/:id/messages/:messageId/reaction', async (req, res) => {
        const input = parseWithSchema(reactionSchema, req.body);
        await service.react(intParam(req.params.id), intParam(req.params.messageId), me(req), input.kind);
        res.json({ status: 'success', data: { kind: input.kind } });
    });

    router.delete('/:id/messages/:messageId', async (req, res) => {
        await service.deleteMessage(intParam(req.params.id), intParam(req.params.messageId), me(req), {
            userId: me(req).id,
            ip: req.ip,
        });
        res.json({ status: 'success', data: { deleted: true } });
    });

    /** POST /api/chats/:id/messages/:messageId/files?name=… — тело: сам файл (до 10 МБ) */
    router.post(
        '/:id/messages/:messageId/files',
        express.raw({ type: () => true, limit: MAX_CHAT_FILE_BYTES }),
        async (req, res) => {
            const viewer = me(req);
            const chatId = intParam(req.params.id);
            await service.access(chatId, viewer);
            const name = typeof req.query.name === 'string' ? req.query.name : '';
            const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
            const info = await files.upload(chatId, intParam(req.params.messageId), viewer, name, body);
            res.status(201).json({ status: 'success', data: info });
        }
    );

    /** GET /api/chats/:id/messages/:messageId/files/:fileId — скачивание */
    router.get('/:id/messages/:messageId/files/:fileId', async (req, res) => {
        const viewer = me(req);
        const chatId = intParam(req.params.id);
        await service.access(chatId, viewer);
        const file = await files.download(chatId, intParam(req.params.messageId), String(req.params.fileId));
        res
            .set('Content-Type', file.contentType)
            .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
            .set('X-Content-Type-Options', 'nosniff')
            .set('Cache-Control', 'private, no-store')
            .send(file.data);
    });

    /** GET /api/chats/avatar/:userId — аватар участника чата */
    router.get('/avatar/:userId', async (req, res) => {
        const avatar = await service.avatarOf(parseUuidParam(req.params.userId));
        if (!avatar) {
            res.status(404).json({ status: 'error', message: 'Аватар не задан' });
            return;
        }
        res
            .set('Content-Type', avatar.contentType)
            .set('X-Content-Type-Options', 'nosniff')
            .set('Cache-Control', 'private, max-age=60')
            .send(avatar.data);
    });

    return router;
}