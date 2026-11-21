/**
 * Ошибки приложения.
 * Сообщения предназначены для пользователя и пишутся по-русски.
 */

/** Базовая ошибка приложения с HTTP-статусом */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Некорректный запрос: формат данных или идентификатор (HTTP 400) */
export class BadRequestError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(400, message, options);
  }
}

/** Нет аутентификации (HTTP 401) */
export class UnauthorizedError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(401, message, options);
  }
}

/** Недостаточно прав (HTTP 403) */
export class ForbiddenError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(403, message, options);
  }
}

/** Запись не найдена (HTTP 404) */
export class NotFoundError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(404, message, options);
  }
}

/** Конфликт данных или дубликат (HTTP 409) */
export class ConflictError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(409, message, options);
  }
}

/** Данные верны по формату, но нарушают правила предметной области (HTTP 422) */
export class UnprocessableError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(422, message, options);
  }
}

/** Сервис или база данных временно недоступны (HTTP 503) */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(503, message, options);
  }
}

/** Слишком много запросов (HTTP 429) */
export class TooManyRequestsError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(429, message, options);
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