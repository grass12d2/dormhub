/**
 * Определение целевой базы данных для командной строки.
 *
 * Тестовая база принимается только если это локальный сервер и имя базы
 * строго dormhub_test. Рабочая база не может указывать на тестовую.
 * Содержимое строки подключения в сообщения об ошибках не попадает,
 * так как в ней находится пароль.
 */

/** Вид целевой базы: рабочая (dev) или тестовая (test) */
export type TargetKind = 'dev' | 'test';

export interface DatabaseTarget {
  kind: TargetKind;
  connectionString: string;
  host: string;
  port: string;
  database: string;
}

const TEST_DATABASE_NAME = 'dormhub_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function resolveTarget(
  kind: TargetKind,
  env: NodeJS.ProcessEnv = process.env
): DatabaseTarget {
  const variable = kind === 'test' ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
  const connectionString = env[variable];

  if (!connectionString) {
    throw new Error(`Не задана переменная окружения ${variable}`);
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`Переменная ${variable} содержит некорректный URL`);
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`Переменная ${variable} должна начинаться с postgresql://`);
  }

  // Параметры после «?» могут подменить сервер или базу, поэтому запрещены
  if (url.search !== '') {
    throw new Error(`Переменная ${variable} не должна содержать параметры после «?»`);
  }

  const database = decodeURIComponent(url.pathname.slice(1));

  if (kind === 'test') {
    if (!LOCAL_HOSTS.has(url.hostname)) {
      throw new Error('Тестовая база должна находиться на локальном сервере');
    }
    if (database !== TEST_DATABASE_NAME) {
      throw new Error(`Тестовая база должна называться ${TEST_DATABASE_NAME}`);
    }
  } else if (database === TEST_DATABASE_NAME) {
    throw new Error('DATABASE_URL не должна указывать на тестовую базу');
  }

  return {
    kind,
    connectionString,
    host: url.hostname,
    port: url.port || '5432',
    database,
  };
}