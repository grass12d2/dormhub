/**
 * Загрузка переменных окружения для тестов.
 * Файл .env берётся из корня репозитория; переменные оболочки имеют приоритет.
 */

import path from 'node:path';

export function loadTestEnvironment(): void {
  const envPath = path.resolve(import.meta.dirname, '../../../.env');
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}