/**
 * Раннер SQL-миграций.
 *
 * - Файлы вида NNN-имя.sql выполняются по порядку номеров без пропусков.
 * - Каждая миграция выполняется в отдельной транзакции вместе с записью
 *   в schema_migrations.
 * - Для каждой применённой миграции хранится контрольная сумма SHA-256:
 *   изменение уже применённого файла обнаруживается и блокирует запуск.
 * - Рекомендательная блокировка не позволяет двум процессам мигрировать одновременно.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

export const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

/** Идентификатор рекомендательной блокировки миграций */
const MIGRATION_LOCK_ID = 7351001;

const FILE_PATTERN = /^(\d{3})-[a-z0-9-]+\.sql$/;

export interface MigrationFile {
  /** Имя файла без расширения, например 001-extensions-and-functions */
  version: string;
  number: number;
  fileName: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
}

export interface MigrationPlan {
  pending: MigrationFile[];
  problems: string[];
}

export type MigrationState = 'applied' | 'pending' | 'changed' | 'missing';

export interface MigrationStatusRow {
  version: string;
  state: MigrationState;
  appliedAt: Date | null;
}

/**
 * Прочитать файлы миграций и проверить имена и последовательность номеров
 */
export async function loadMigrationFiles(dir: string = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];

  for (const [index, fileName] of names.entries()) {
    const match = FILE_PATTERN.exec(fileName);
    if (!match) {
      throw new Error(`Недопустимое имя файла миграции: ${fileName}`);
    }

    const number = Number(match[1]);
    if (number !== index + 1) {
      const expected = String(index + 1).padStart(3, '0');
      throw new Error(`Нарушена последовательность номеров: ожидался ${expected}, найден ${fileName}`);
    }

    const sql = await readFile(path.join(dir, fileName), 'utf-8');
    files.push({
      version: fileName.slice(0, -'.sql'.length),
      number,
      fileName,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }

  return files;
}

/**
 * Сопоставить файлы с применёнными миграциями и найти проблемы
 */
export function planMigrations(files: MigrationFile[], applied: AppliedMigration[]): MigrationPlan {
  const problems: string[] = [];
  const fileMap = new Map(files.map((file) => [file.version, file]));
  const appliedVersions = new Set(applied.map((record) => record.version));
  let maxAppliedNumber = 0;

  for (const record of applied) {
    const file = fileMap.get(record.version);
    if (!file) {
      problems.push(`Применённая миграция ${record.version} отсутствует среди файлов`);
      continue;
    }
    if (file.checksum !== record.checksum) {
      problems.push(`Файл ${file.fileName} изменён после применения`);
    }
    maxAppliedNumber = Math.max(maxAppliedNumber, file.number);
  }

  const pending = files.filter((file) => !appliedVersions.has(file.version));
  for (const file of pending) {
    if (file.number < maxAppliedNumber) {
      problems.push(`Миграция ${file.fileName} имеет номер меньше уже применённых`);
    }
  }

  return { pending, problems };
}

function createClient(connectionString: string): Client {
  return new Client({ connectionString, application_name: 'dormhub-migrations' });
}

async function getAppliedMigrations(client: Client): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
  );
  return result.rows;
}

async function applyMigration(client: Client, migration: MigrationFile): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(migration.sql);
    await client.query(
      'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.fileName, migration.checksum]
    );
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Соединение всё равно будет закрыто в вызывающем коде
    }
    throw error;
  }
}

/**
 * Применить все ожидающие миграции. Возвращает число применённых.
 */
export async function runMigrations(
  connectionString: string,
  log: (message: string) => void = () => undefined
): Promise<number> {
  const files = await loadMigrationFiles();
  const client = createClient(connectionString);
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = await getAppliedMigrations(client);
    const { pending, problems } = planMigrations(files, applied);

    if (problems.length > 0) {
      throw new Error(`Обнаружены проблемы с миграциями:\n- ${problems.join('\n- ')}`);
    }

    for (const migration of pending) {
      log(`[${migration.version}] выполняется...`);
      await applyMigration(client, migration);
      log(`[${migration.version}] применена`);
    }

    return pending.length;
  } finally {
    await client.end();
  }
}

/**
 * Получить состояние миграций (только чтение, ничего не изменяет)
 */
export async function getMigrationStatus(connectionString: string): Promise<MigrationStatusRow[]> {
  const files = await loadMigrationFiles();
  const client = createClient(connectionString);
  await client.connect();

  try {
    const exists = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
    );
    const applied = exists.rows[0]?.exists ? await getAppliedMigrations(client) : [];
    const appliedMap = new Map(applied.map((record) => [record.version, record]));

    const rows = files.map((file): MigrationStatusRow => {
      const record = appliedMap.get(file.version);
      if (!record) {
        return { version: file.version, state: 'pending', appliedAt: null };
      }
      return {
        version: file.version,
        state: record.checksum === file.checksum ? 'applied' : 'changed',
        appliedAt: record.applied_at,
      };
    });

    const fileVersions = new Set(files.map((file) => file.version));
    for (const record of applied) {
      if (!fileVersions.has(record.version)) {
        rows.push({ version: record.version, state: 'missing', appliedAt: record.applied_at });
      }
    }

    return rows;
  } finally {
    await client.end();
  }
}