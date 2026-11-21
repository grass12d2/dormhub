import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { TEST_APP_OPTIONS } from '../setup/app-options.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

describe('GET /api/health на реальной базе', () => {
  it('возвращает 200 и подтверждает работу базы', async () => {
    const response = await request(createApp(pool, TEST_APP_OPTIONS)).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ service: 'dormhub-api', database: 'ok' });
  });
});