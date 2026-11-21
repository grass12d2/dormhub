/**
 * Создание Express-приложения.
 *
 * Приложение собирается функцией createApp(pool): тесты могут создавать
 * независимые экземпляры, а глобального состояния нет.
 */

import express from 'express';
import type { Pool } from 'pg';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHealthRoutes } from './routes/health.routes.js';

export function createApp(pool: Pool): express.Express {
  const app = express();

  // Не раскрывать используемый фреймворк
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', createHealthRoutes(pool));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}