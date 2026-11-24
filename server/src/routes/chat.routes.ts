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

function intParam(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value) || Number(value) < 1) {
    throw new BadRequestError('Некорректный идентификатор');
  }
  return Number(value);
}

export function createChatRoutes(service: ChatService, authenticate: RequestHandler): express.Router {
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

  return router;
}