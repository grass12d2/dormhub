import { api } from './index';

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryLeft: number;
}

export const getTwoFactorStatus = async () => (await api.get<TwoFactorStatus>('/account/2fa')).data;

export const setupTwoFactor = async () =>
  (await api.post<{ secret: string; otpauthUrl: string }>('/account/2fa/setup')).data;

/** Возвращает коды восстановления; сервер показывает их только один раз */
export const enableTwoFactor = async (code: string) =>
  (await api.post<{ recoveryCodes: string[] }>('/account/2fa/enable', { code })).data.recoveryCodes;

export const disableTwoFactor = async (currentPassword: string, code: string) =>
  (await api.post<{ enabled: boolean }>('/account/2fa/disable', { currentPassword, code })).data;