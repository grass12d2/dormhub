/**
 * Проверка данных запроса по схеме Zod.
 */

import type { z } from 'zod';
import { BadRequestError } from '../utils/errors.js';

/**
 * Разобрать данные по схеме. При ошибке выбрасывает BadRequestError (HTTP 400)
 * с русским сообщением, перечисляющим некорректные поля. Текст сообщений
 * валидатора (английский) пользователю не показывается.
 */
export function parseWithSchema<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const fields = new Set<string>();
  for (const issue of result.error.issues) {
    if ('keys' in issue && Array.isArray(issue.keys)) {
      // Лишние поля перечисляются по именам
      for (const key of issue.keys) {
        fields.add(String(key));
      }
      continue;
    }
    fields.add(issue.path.length > 0 ? issue.path.map(String).join('.') : 'тело запроса');
  }

  throw new BadRequestError(`Некорректные данные запроса: ${[...fields].join(', ')}`);
}