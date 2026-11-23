/** Схемы проверки данных учётной записи */

import { z } from 'zod';
import { emailSchema } from './auth.validation.js';

/** Смена пароля: лишние поля запрещены; политика нового пароля проверяется в сервисе */
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Телефон: «+7 900 123-45-67»; null очищает поле */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+7 \d{3} \d{3}-\d{2}-\d{2}$/, 'Телефон в формате +7 900 123-45-67');

/** PATCH профиля: хотя бы одно поле; null очищает необязательное поле */
export const patchProfileSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(200).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    jobTitle: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Укажите хотя бы одно поле');

export type PatchProfileInput = z.infer<typeof patchProfileSchema>;

/** Смена email: нужен текущий пароль */
export const changeEmailSchema = z.strictObject({
  email: emailSchema,
  currentPassword: z.string().min(1).max(128),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;