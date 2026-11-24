/**
 * Пул соединений для интеграционных тестов.
 * Перед сообщежитием пула повторяются проверки безопасности.
 */

import { Pool } from 'pg';
import { resolveTarget } from '../../src/db/target.js';
import { loadTestEnvironment } from './env.js';
import { assertNoConnectionOverrides } from './guard.js';

export function createTestPool(): Pool {
  loadTestEnvironment();
  assertNoConnectionOverrides();
  const target = resolveTarget('test');

  return new Pool({
    connectionString: target.connectionString,
    application_name: 'dormhub-tests',
    max: 5,
  });
}