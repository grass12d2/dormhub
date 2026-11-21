/**
 * Проверка ошибок, возвращаемых базой данных.
 */

import { expect } from 'vitest';

export interface ExpectedDbError {
  /** Код SQLSTATE, например 23505 */
  code: string;
  /** Имя нарушенного ограничения или индекса */
  constraint?: string;
}

/**
 * Выполнить операцию и убедиться, что база вернула ожидаемую ошибку.
 */
export async function expectDbError(
  operation: Promise<unknown>,
  expected: ExpectedDbError
): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }

  expect(caught, 'операция должна завершиться ошибкой базы данных').toBeDefined();
  const details = caught as { code?: string; constraint?: string };
  expect(details.code).toBe(expected.code);
  if (expected.constraint !== undefined) {
    expect(details.constraint).toBe(expected.constraint);
  }
}