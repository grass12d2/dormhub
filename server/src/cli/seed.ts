/**
 * Команда загрузки демонстрационных данных: npm run seed -w server
 *
 * Отказывается работать, если цель не локальная база разработки «dormhub»,
 * если в ней уже есть общежития, студенты или договоры, или если не задан
 * SEED_DEMO_PASSWORD. Пароль берётся из окружения и в коде не хранится.
 */

import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { withRetry } from '../db/transaction.js';
import { loadDemoData } from '../seed/seed.js';
import { DEFAULT_BCRYPT_ROUNDS, validatePasswordPolicy } from '../utils/password.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Подгрузить .env из корня репозитория; уже заданные переменные не перезаписываются */
function loadEnvFile(): void {
  const loader = (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (!loader) {
    return;
  }
  try {
    loader.call(process, fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    // Файла может не быть: переменные тогда должны быть заданы в окружении
  }
}

interface DevTarget {
  connectionString: string;
  host: string;
  port: string;
  database: string;
}

/** Проверить, что DATABASE_URL указывает на локальную базу «dormhub» */
function resolveDevTarget(): DevTarget {
  const connectionString = process.env.DATABASE_URL ?? '';
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL не задан или имеет неверный формат');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database !== 'dormhub') {
    throw new Error(`Загрузка отменена: целевая база «${database}», а не «dormhub»`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Загрузка отменена: хост «${url.hostname}» не локальный`);
  }
  return { connectionString, host: url.hostname, port: url.port || '5432', database };
}

async function main(): Promise<void> {
  loadEnvFile();
  const target = resolveDevTarget();

  const password = process.env.SEED_DEMO_PASSWORD ?? '';
  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    throw new Error(`SEED_DEMO_PASSWORD: ${policyError}`);
  }

  const pool = new pg.Pool({ connectionString: target.connectionString, max: 1 });
  try {
    const counts = await pool.query<{ buildings: number; students: number; contracts: number }>(
      `SELECT (SELECT count(*) FROM buildings)::int AS buildings,
              (SELECT count(*) FROM students)::int AS students,
              (SELECT count(*) FROM contracts)::int AS contracts`
    );
    const { buildings, students, contracts } = counts.rows[0];
    if (buildings > 0 || students > 0 || contracts > 0) {
      throw new Error(
        `Загрузка отменена: в базе уже есть данные (общежитий: ${buildings}, студентов: ${students}, договоров: ${contracts})`
      );
    }

    console.log(`Цель: база «${target.database}» на ${target.host}:${target.port} (dev)`);
    const summary = await withRetry(pool, (client) =>
      loadDemoData(client, { password, bcryptRounds: DEFAULT_BCRYPT_ROUNDS })
    );
    console.log('Демонстрационные данные загружены:');
    for (const [name, value] of Object.entries(summary)) {
      console.log(`  ${name}: ${value}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});