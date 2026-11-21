/**
 * Настройки приложения для тестов.
 * Секрет вымышленный; стоимость bcrypt минимальная, чтобы тесты шли быстро.
 */

import type { AppOptions } from '../../src/app.js';
import type { AuthServiceOptions } from '../../src/services/auth.service.js';

export const TEST_JWT_SECRET = 'test-secret-for-dormhub-tests-0123456789';

export function createTestAppOptions(
  authOverrides: Partial<AuthServiceOptions> = {}
): AppOptions {
  return {
    auth: { jwtSecret: TEST_JWT_SECRET, bcryptRounds: 4, ...authOverrides },
    // В тестах IP-адрес клиента задаётся заголовком X-Forwarded-For
    trustProxy: true,
  };
}

export const TEST_APP_OPTIONS: AppOptions = createTestAppOptions();