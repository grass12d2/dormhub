/**
 * Настройки приложения для тестов.
 * Секрет вымышленный; стоимость bcrypt минимальная, чтобы тесты шли быстро.
 */

import type { AppOptions } from '../../src/app.js';

export const TEST_JWT_SECRET = 'test-secret-for-dormhub-tests-0123456789';

export const TEST_APP_OPTIONS: AppOptions = {
  auth: { jwtSecret: TEST_JWT_SECRET, bcryptRounds: 4 },
};