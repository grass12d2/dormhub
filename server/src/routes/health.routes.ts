/**
 * Проверка работоспособности сервиса.
 */

import express from 'express';
import type { Pool } from 'pg';
import { ServiceUnavailableError } from '../utils/errors.js';

export function createHealthRoutes(pool: Pick<Pool, 'query'>): express.Router {
  const router = express.Router();

  /** GET /api/health — сервис работает и база данных отвечает */
  router.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      throw new ServiceUnavailableError('База данных недоступна', { cause: error });
    }
    res.json({ status: 'success', data: { service: 'dormhub-api', database: 'ok' } });
  });

  return router;
}