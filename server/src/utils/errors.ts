/**
 * Ошибки приложения.
 * Сообщения предназначены для пользователя и пишутся по-русски.
 */

/** Базовая ошибка приложения с HTTP-статусом */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Конфликт данных или дубликат (HTTP 409) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

/**
 * Внутренняя ошибка для выборочного повтора транзакции.
 * Пользователю не показывается: после исчерпания попыток
 * withRetry заменяет её на ConflictError.
 */
export class RetryableConflict extends Error {
  constructor(message = 'Конфликт при выполнении транзакции, требуется повтор') {
    super(message);
    this.name = 'RetryableConflict';
  }
}