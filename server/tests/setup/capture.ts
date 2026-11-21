/**
 * Получение ошибки базы данных для подробной проверки
 * (код SQLSTATE, имя ограничения, текст сообщения).
 */

export interface CapturedDbError {
  code?: string;
  constraint?: string;
  message: string;
}

/**
 * Выполнить операцию и вернуть ошибку, которой она завершилась.
 * Если ошибки нет, тест падает с понятным сообщением.
 */
export async function captureDbError(operation: Promise<unknown>): Promise<CapturedDbError> {
  try {
    await operation;
  } catch (error) {
    const details = error as { code?: string; constraint?: string; message?: string };
    return {
      code: details.code,
      constraint: details.constraint,
      message: details.message ?? String(error),
    };
  }
  throw new Error('Ожидалась ошибка базы данных, но операция завершилась успешно');
}