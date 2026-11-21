/**
 * Подготовка тестовой базы перед интеграционными тестами.
 *
 * Разрушительные действия (удаление схемы public) выполняются только
 * после всех проверок: строка подключения, переменные libpq и фактическое
 * имя базы из current_database(). Рабочая база dormhub не затрагивается.
 */

import { Client } from 'pg';
import { runMigrations } from '../../src/db/migrations.js';
import { resolveTarget } from '../../src/db/target.js';
import { loadTestEnvironment } from './env.js';
import { assertConnectedToTestDatabase, assertNoConnectionOverrides } from './guard.js';

export default async function setup(): Promise<void> {
  loadTestEnvironment();
  assertNoConnectionOverrides();
  const target = resolveTarget('test');

  const client = new Client({
    connectionString: target.connectionString,
    application_name: 'dormhub-test-setup',
  });
  await client.connect();

  try {
    const result = await client.query<{ current_database: string }>('SELECT current_database()');
    assertConnectedToTestDatabase(result.rows[0]?.current_database ?? '');

    // Только после проверки: полный сброс схемы тестовой базы
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  const applied = await runMigrations(target.connectionString);
  console.log(`[тесты] база «${target.database}» пересоздана, применено миграций: ${applied}`);
}