/**
 * Схемы проверки данных аутентификации.
 */

import { z } from 'zod';

/** Email: без пробелов по краям, в нижнем регистре, не длиннее 254 символов */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Вход: лишние поля запрещены. Длина пароля ограничена, чтобы не нагружать bcrypt */
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});