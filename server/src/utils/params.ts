/**
 * Разбор параметров маршрута.
 */

import { z } from 'zod';
import { BadRequestError } from './errors.js';

/** UUID приводится к нижнему регистру, как его хранит PostgreSQL */
const uuidSchema = z.uuid().transform((value) => value.toLowerCase());

/**
 * Проверить UUID из параметра маршрута.
 * При ошибке выбрасывает BadRequestError (HTTP 400).
 */
export function parseUuidParam(value: unknown): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    throw new BadRequestError('Некорректный идентификатор');
  }
  return result.data;
}