/**
 * Обработка ошибок HTTP-приложения.
 *
 * Пользователю возвращаются только безопасные сообщения на русском языке.
 * Тексты ошибок PostgreSQL, SQL-запросы и стек вызовов клиенту не отправляются:
 * подробности пишутся только в журнал сервера.
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
} from '../utils/errors.js';

const CONCURRENT_CHANGES_MESSAGE =
  'Не удалось выполнить операцию из-за параллельных изменений. Повторите попытку.';

/** Коды сетевых ошибок Node.js, означающие недоступность базы данных */
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);

/** SQLSTATE: сервер завершает работу, перезапускается или перегружен */
const UNAVAILABLE_SQLSTATES = new Set(['57P01', '57P02', '57P03', '53300']);

/**
 * Преобразовать ошибку драйвера pg в безопасную ошибку приложения.
 * Для неизвестных ошибок возвращает null.
 */
export function mapDatabaseError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') {
    return null;
  }

  switch (code) {
    case '23505': // unique_violation
      return new ConflictError('Запись с такими данными уже существует');
    case '23503': // foreign_key_violation
      return new ConflictError('Операция невозможна: нарушена связь с другими записями');
    case '23P01': // exclusion_violation
      return new ConflictError('Данные пересекаются с уже существующей записью');
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return new ConflictError(CONCURRENT_CHANGES_MESSAGE);
    case 'P0001': // RAISE EXCEPTION в триггерах неизменяемых таблиц
      return new ConflictError('Операция запрещена: данные неизменяемы');
    case '23514': // check_violation
    case '23502': // not_null_violation
      return new BadRequestError('Данные нарушают ограничения базы данных');
    case '55P03': // lock_not_available (истёк lock_timeout)
      return new ServiceUnavailableError('Сервис временно занят. Повторите запрос позже.');
    default:
      break;
  }

  // Класс 22: недопустимое значение (формат UUID, число вне диапазона и т. п.)
  if (code.startsWith('22')) {
    return new BadRequestError('Некорректное значение в запросе');
  }

  // Класс 08: ошибки соединения; а также сетевые сбои и остановка сервера
  if (code.startsWith('08') || NETWORK_ERROR_CODES.has(code) || UNAVAILABLE_SQLSTATES.has(code)) {
    return new ServiceUnavailableError('База данных временно недоступна');
  }

  return null;
}

/** Ошибки разбора тела запроса (body-parser) определяются по полю type */
function mapBodyParserError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return null;
  }

  switch ((error as { type?: unknown }).type) {
    case 'entity.parse.failed':
      return new AppError(400, 'Некорректный JSON в теле запроса');
    case 'entity.too.large':
      return new AppError(413, 'Слишком большое тело запроса');
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new AppError(415, 'Неподдерживаемая кодировка запроса');
    case 'request.aborted':
    case 'request.size.invalid':
      return new AppError(400, 'Некорректный запрос');
    default:
      return null;
  }
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return (
    mapDatabaseError(error) ??
    mapBodyParserError(error) ??
    new AppError(500, 'Внутренняя ошибка сервера', { cause: error })
  );
}

/** Ответ 404 для неизвестных маршрутов */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 'error', message: 'Маршрут не найден' });
};

/** Единый обработчик ошибок: все ответы об ошибках имеют вид { status, message } */
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);

  // В журнал попадают только серверные ошибки (5xx), с исходной причиной
  if (appError.status >= 500) {
    console.error('[ошибка]', error);
  }

  res.status(appError.status).json({ status: 'error', message: appError.message });
};