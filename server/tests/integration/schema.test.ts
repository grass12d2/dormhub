import { afterAll, describe, expect, it } from 'vitest';
import { loadMigrationFiles } from '../../src/db/migrations.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

const EXPECTED_TABLES = [
  'audit_logs',
  'beds',
  'building_staff',
  'buildings',
  'contracts',
  'invoices',
  'payments',
  'rooms',
  'schema_migrations',
  'students',
  'users',
  'user_avatars',
  'user_profiles',
];

describe('тестовая база после применения миграций', () => {
  it('подключение выполнено к dormhub_test', async () => {
    const result = await pool.query<{ current_database: string }>('SELECT current_database()');
    expect(result.rows[0].current_database).toBe('dormhub_test');
  });

  it('применены все файлы миграций', async () => {
    const files = await loadMigrationFiles();
    const result = await pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM schema_migrations'
    );
    expect(Number(result.rows[0].count)).toBe(files.length);
  });

  it('созданы все таблицы', async () => {
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const actual = result.rows.map((row) => row.table_name).sort();
    expect(actual).toEqual([...EXPECTED_TABLES].sort());
  });

  it('установлено расширение btree_gist', async () => {
    const result = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'");
    expect(result.rowCount).toBe(1);
  });
});