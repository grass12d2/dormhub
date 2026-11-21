/**
 * Создание Express-приложения.
 *
 * Приложение собирается функцией createApp(pool, options): тесты могут создавать
 * независимые экземпляры, а глобального состояния нет.
 */

import express from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { createAuthenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { AuthService, type AuthServiceOptions } from './services/auth.service.js';

export interface AppOptions {
  auth: AuthServiceOptions;
}

export function createApp(pool: Pool, options: AppOptions): express.Express {
  const app = express();

  // Не раскрывать используемый фреймворк и добавить защитные заголовки
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  const authService = new AuthService(pool, options.auth);
  const authenticate = createAuthenticate(authService);

  app.use('/api/health', createHealthRoutes(pool));
  app.use('/api/auth', createAuthRoutes(authService, authenticate));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}