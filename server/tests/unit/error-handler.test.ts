import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  errorHandler,
  mapDatabaseError,
  notFoundHandler,
} from '../../src/middleware/error-handler.js';
import { AppError, NotFoundError } from '../../src/utils/errors.js';

/** Ошибка с кодом SQLSTATE и «сырым» англоязычным текстом, как у драйвера pg */
function dbError(code: string): Error {
  return Object.assign(new Error(`raw database message for ${code}`), { code });
}

const MAPPINGS: Array<[string, number]> = [
  ['23505', 409],
  ['23503', 409],
  ['23P01', 409],
  ['40001', 409],
  ['40P01', 409],
  ['P0001', 409],
  ['23514', 400],
  ['23502', 400],
  ['22P02', 400],
  ['22003', 400],
  ['55P03', 503],
  ['08006', 503],
  ['ECONNREFUSED', 503],
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapDatabaseError', () => {
  it.each(MAPPINGS)('SQLSTATE %s даёт HTTP %i', (code, status) => {
    const mapped = mapDatabaseError(dbError(code));
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped?.status).toBe(status);
  });

  it.each<[string, unknown]>([
    ['неизвестный код SQLSTATE', dbError('XX000')],
    ['ошибка без кода', new Error('без кода')],
    ['строка', 'ошибка строкой'],
    ['null', null],
  ])('возвращает null: %s', (_name, error) => {
    expect(mapDatabaseError(error)).toBeNull();
  });

  it('сообщения на русском и не содержат текст исходной ошибки', () => {
    for (const [code] of MAPPINGS) {
      const mapped = mapDatabaseError(dbError(code));
      expect(mapped?.message).toMatch(/[А-Яа-яЁё]/);
      expect(mapped?.message).not.toContain('raw database message');
    }
  });
});

/** Минимальное приложение, в котором маршрут /boom выбрасывает заданную ошибку */
function buildApp(thrower: () => unknown) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.get('/boom', async () => {
    throw thrower();
  });
  app.post('/echo', (req, res) => {
    res.json({ status: 'success', data: req.body });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('ошибка приложения возвращается со своим статусом и сообщением', async () => {
    const response = await request(buildApp(() => new NotFoundError('Запись не найдена'))).get(
      '/boom'
    );
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Запись не найдена' });
  });

  it('ошибка PostgreSQL преобразуется без раскрытия подробностей', async () => {
    const raw = 'duplicate key value violates unique constraint "users_email_key"';
    const error = Object.assign(new Error(raw), { code: '23505', constraint: 'users_email_key' });

    const response = await request(buildApp(() => error)).get('/boom');

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/[А-Яа-яЁё]/);
    expect(response.text).not.toContain('duplicate');
    expect(response.text).not.toContain('users_email_key');
  });

  it('неизвестная ошибка даёт 500 без раскрытия причины', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(buildApp(() => new Error('секретная причина сбоя'))).get(
      '/boom'
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 'error', message: 'Внутренняя ошибка сервера' });
    expect(response.text).not.toContain('секретная причина');
  });

  it('ошибки 5xx пишутся в журнал, ошибки 4xx — нет', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await request(buildApp(() => new NotFoundError('Не найдено'))).get('/boom');
    expect(log).not.toHaveBeenCalled();

    await request(buildApp(() => new Error('сбой'))).get('/boom');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('некорректный JSON даёт 400 с русским сообщением', async () => {
    const response = await request(buildApp(() => new Error('не используется')))
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Некорректный JSON в теле запроса',
    });
  });

  it('слишком большое тело запроса даёт 413', async () => {
    const response = await request(buildApp(() => new Error('не используется')))
      .post('/echo')
      .send({ text: 'x'.repeat(2000) });

    expect(response.status).toBe(413);
    expect(response.body.status).toBe('error');
    expect(response.body.message).toMatch(/[А-Яа-яЁё]/);
  });

  it('неизвестный маршрут даёт 404 в формате JSON', async () => {
    const response = await request(buildApp(() => new Error('не используется'))).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Маршрут не найден' });
  });

  it('корректное тело запроса проходит без ошибок', async () => {
    const response = await request(buildApp(() => new Error('не используется')))
      .post('/echo')
      .send({ ok: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ ok: true });
  });
});