import type { Pool } from 'pg';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { TEST_APP_OPTIONS } from '../setup/app-options.js';

/** Поддельный пул: проверка здоровья вызывает только query */
function fakePool(query: () => Promise<unknown>): Pool {
  return { query } as unknown as Pool;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createApp', () => {
  it('GET /api/health возвращает 200, если база отвечает', async () => {
    const app = createApp(fakePool(async () => ({ rows: [] })), TEST_APP_OPTIONS);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'success',
      data: { service: 'dormhub-api', database: 'ok' },
    });
  });

  it('GET /api/health возвращает 503, если база недоступна, без внутренних подробностей', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp(
      fakePool(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret');
      }),
      TEST_APP_OPTIONS
    );

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', message: 'База данных недоступна' });
    expect(response.text).not.toContain('ECONNREFUSED');
    expect(response.text).not.toContain('secret');
  });

  it('заголовок X-Powered-By отключён', async () => {
    const app = createApp(fakePool(async () => ({ rows: [] })), TEST_APP_OPTIONS);

    const response = await request(app).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('защитные заголовки helmet добавлены', async () => {
    const app = createApp(fakePool(async () => ({ rows: [] })), TEST_APP_OPTIONS);

    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('неизвестный маршрут возвращает 404 в формате JSON', async () => {
    const app = createApp(fakePool(async () => ({ rows: [] })), TEST_APP_OPTIONS);

    const response = await request(app).get('/api/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ status: 'error', message: 'Маршрут не найден' });
  });
});