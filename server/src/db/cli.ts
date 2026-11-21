/**
 * Командная строка для миграций.
 * Использование: tsx src/db/cli.ts <migrate|status> <dev|test>
 */

import path from 'node:path';
import { getMigrationStatus, runMigrations, type MigrationState } from './migrations.js';
import { resolveTarget } from './target.js';

const STATE_LABELS: Record<MigrationState, string> = {
  applied: '✓ применена',
  pending: '○ ожидает применения',
  changed: '✗ ИЗМЕНЕНА после применения',
  missing: '✗ ФАЙЛ ОТСУТСТВУЕТ',
};

/** Загрузить .env из корня репозитория; переменные оболочки имеют приоритет */
function loadEnvironment(): void {
  const envPath = path.resolve(import.meta.dirname, '../../../.env');
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const [command, kind] = process.argv.slice(2);

  if ((command !== 'migrate' && command !== 'status') || (kind !== 'dev' && kind !== 'test')) {
    throw new Error('Использование: tsx src/db/cli.ts <migrate|status> <dev|test>');
  }

  loadEnvironment();
  const target = resolveTarget(kind);
  console.log(`Цель: база «${target.database}» на ${target.host}:${target.port} (${kind})`);

  if (command === 'migrate') {
    const count = await runMigrations(target.connectionString, console.log);
    console.log(count === 0 ? 'Новых миграций нет' : `Итого применено: ${count}`);
    return;
  }

  const rows = await getMigrationStatus(target.connectionString);
  for (const row of rows) {
    console.log(`${STATE_LABELS[row.state]}  ${row.version}`);
  }
  const appliedCount = rows.filter((row) => row.state === 'applied').length;
  console.log(`Применено: ${appliedCount} из ${rows.length}`);
}

main().catch((error: unknown) => {
  console.error('Ошибка:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});