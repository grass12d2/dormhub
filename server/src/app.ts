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
import { createBuildingsRoutes } from './routes/buildings.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { createRoomsRoutes } from './routes/rooms.routes.js';
import { AuthService, type AuthServiceOptions } from './services/auth.service.js';
import { BuildingsService } from './services/buildings.service.js';
import { RoomsService } from './services/rooms.service.js';

export interface AppOptions {
  auth: AuthServiceOptions;
  /**
   * Доверять заголовку X-Forwarded-For (число промежуточных прокси или true).
   * По умолчанию выключено: иначе клиент мог бы подделать свой IP-адрес
   * и обойти ограничение попыток входа.
   */
  trustProxy?: boolean | number | string;
}

export function createApp(pool: Pool, options: AppOptions): express.Express {
  const app = express();

  if (options.trustProxy !== undefined) {
    app.set('trust proxy', options.trustProxy);
  }

  // Не раскрывать используемый фреймворк и добавить защитные заголовки
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  const authService = new AuthService(pool, options.auth);
  const authenticate = createAuthenticate(authService);

  app.use('/api/health', createHealthRoutes(pool));
  app.use('/api/auth', createAuthRoutes(authService, authenticate));
  app.use('/api/buildings', createBuildingsRoutes(new BuildingsService(pool), authenticate));
  app.use('/api/rooms', createRoomsRoutes(new RoomsService(pool), authenticate));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}