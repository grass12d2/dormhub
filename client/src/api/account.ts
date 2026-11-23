import { api } from './index';

export const changePassword = async (currentPassword: string, newPassword: string) =>
  (await api.post<{ changed: boolean }>('/account/password', { currentPassword, newPassword })).data;