/** Схемы проверки данных учётной записи */

import { z } from 'zod';

/** Смена пароля: лишние поля запрещены; политика нового пароля проверяется в сервисе */
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;