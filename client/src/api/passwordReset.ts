import { api } from './index';

export const requestResetCode = async (email: string) =>
  (await api.post<{ message: string }>('/auth/forgot-password', { email })).data;

export const resetPassword = async (email: string, code: string, newPassword: string) =>
  (await api.post<{ changed: boolean }>('/auth/reset-password', { email, code, newPassword })).data;