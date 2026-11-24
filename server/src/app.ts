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
import { createAuditLogsRoutes } from './routes/audit-logs.routes.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createBedsRoutes } from './routes/beds.routes.js';
import { createBuildingsRoutes } from './routes/buildings.routes.js';
import { createContractsRoutes } from './routes/contracts.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { createInvoicesRoutes } from './routes/invoices.routes.js';
import { createPaymentsRoutes } from './routes/payments.routes.js';
import { createRoomsRoutes } from './routes/rooms.routes.js';
import { createStudentsRoutes } from './routes/students.routes.js';
import { AuditLogsService } from './services/audit-logs.service.js';
import { AuthService, type AuthServiceOptions } from './services/auth.service.js';
import { BedsService } from './services/beds.service.js';
import { BuildingsService } from './services/buildings.service.js';
import { ContractsService } from './services/contracts.service.js';
import { InvoicesService } from './services/invoices.service.js';
import { PaymentsService } from './services/payments.service.js';
import { RoomsService } from './services/rooms.service.js';
import { StudentsService } from './services/students.service.js';
import { createDashboardRoutes } from './routes/dashboard.routes.js';
import { DashboardService } from './services/dashboard.service.js';
import { createMeRoutes } from './routes/me.routes.js';
import { ResidenceService } from './services/residence.service.js';
import { createAccountRoutes } from './routes/account.routes.js';
import { AccountService } from './services/account.service.js';
import { ProfileService } from './services/profile.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import type { Mailer } from './services/mailer.js';
import { TwoFactorService } from './services/two-factor.service.js';
import { createAnnouncementsRoutes } from './routes/announcements.routes.js';
import { AnnouncementsService } from './services/announcements.service.js';
import { AnnouncementFilesService } from './services/announcement-files.service.js';
import { createChatRoutes } from './routes/chat.routes.js';
import { ChatService } from './services/chat.service.js';

export interface AppOptions {
  auth: AuthServiceOptions;
  /**
   * Доверять заголовку X-Forwarded-For (число промежуточных прокси или true).
   * По умолчанию выключено: иначе клиент мог бы подделать свой IP-адрес
   * и обойти ограничение попыток входа.
   */
  trustProxy?: boolean | number | string;
  /** Отправка писем; в тестах подставляется заглушка */
  mailer: Mailer;
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
  const studentsService = new StudentsService(pool, { bcryptRounds: options.auth.bcryptRounds });
  const twoFactor = new TwoFactorService(pool, { secret: options.auth.jwtSecret });
  const passwordReset = new PasswordResetService(pool, {
    secret: options.auth.jwtSecret,
    mailer: options.mailer,
    bcryptRounds: options.auth.bcryptRounds,
    twoFactor,
  });

  app.use('/api/health', createHealthRoutes(pool));
  app.use(
    '/api/auth',
    createAuthRoutes(authService, passwordReset, twoFactor, options.auth.jwtSecret, authenticate)
  );
  app.use('/api/buildings', createBuildingsRoutes(new BuildingsService(pool), authenticate));
  app.use('/api/rooms', createRoomsRoutes(new RoomsService(pool), authenticate));
  app.use('/api/beds', createBedsRoutes(new BedsService(pool), authenticate));
  app.use('/api/students', createStudentsRoutes(studentsService, authenticate));
  app.use('/api/contracts', createContractsRoutes(new ContractsService(pool), authenticate));
  app.use('/api/invoices', createInvoicesRoutes(new InvoicesService(pool), authenticate));
  app.use('/api/payments', createPaymentsRoutes(new PaymentsService(pool), authenticate));
  app.use('/api/audit-logs', createAuditLogsRoutes(new AuditLogsService(pool), authenticate));
  app.use('/api/dashboard', createDashboardRoutes(new DashboardService(pool), authenticate));
  app.use('/api/me', createMeRoutes(new ResidenceService(pool), authenticate));
  app.use('/api/chats', createChatRoutes(new ChatService(pool), authenticate));
  app.use(
    '/api/account',
    createAccountRoutes(
      new AccountService(pool, { bcryptRounds: options.auth.bcryptRounds }),
      new ProfileService(pool),
      twoFactor,
      authenticate
    )
  );

  const announcementFiles = new AnnouncementFilesService(pool);
  app.use(
    '/api/announcements',
    createAnnouncementsRoutes(new AnnouncementsService(pool, announcementFiles), announcementFiles, authenticate)
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}