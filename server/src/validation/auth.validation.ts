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

export const forgotPasswordSchema = z.strictObject({ email: emailSchema });

export const resetPasswordSchema = z.strictObject({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(1).max(128),
});

export const loginTwoFactorSchema = z.strictObject({
  challengeToken: z.string().min(1).max(2000),
  code: z.string().trim().min(6).max(20),
});