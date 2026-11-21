/**
 * Настройки сервера из переменных окружения.
 */

import path from 'node:path';
import { resolveTarget } from './db/target.js';

export interface AppConfig {
  port: number;
  databaseUrl: string;
}

/** Загрузить .env из корня репозитория; переменные оболочки имеют приоритет */
export function loadEnvFile(): void {
  const envPath = path.resolve(import.meta.dirname, '../../.env');
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Прочитать и проверить настройки.
 * Строка подключения проверяется так же, как в командной строке миграций:
 * рабочая база не может указывать на dormhub_test.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const target = resolveTarget('dev', env);

  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Переменная PORT должна быть целым числом от 1 до 65535');
  }

  return { port, databaseUrl: target.connectionString };
}