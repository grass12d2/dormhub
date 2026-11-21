/**
 * Проверка ошибок PostgreSQL.
 */

/**
 * Ошибка базы данных с указанным кодом SQLSTATE и, если задано, именем ограничения.
 * Проверка имени не даёт принять одно нарушение за другое
 * (например, ошибку аудита за нарушение зависимости здания).
 */
export function isDbError(error: unknown, code: string, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const details = error as { code?: unknown; constraint?: unknown };
  return details.code === code && (constraint === undefined || details.constraint === constraint);
}