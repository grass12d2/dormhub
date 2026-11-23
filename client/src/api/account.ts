import { ApiError, sessionTokenStore } from './client';
import { api } from './index';

export const changePassword = async (currentPassword: string, newPassword: string) =>
  (await api.post<{ changed: boolean }>('/account/password', { currentPassword, newPassword })).data;

export interface Profile {
  email: string;
  role: 'admin' | 'student';
  displayName: string | null;
  phone: string | null;
  jobTitle: string | null;
  hasAvatar: boolean;
  student: {
    studentNumber: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    birthDate: string;
    faculty: string | null;
    groupName: string | null;
    studyYear: number | null;
  } | null;
}

export const getProfile = async () => (await api.get<Profile>('/account/profile')).data;

export const patchProfile = async (body: {
  displayName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}) => (await api.patch<Profile>('/account/profile', body)).data;

export const changeEmail = async (email: string, currentPassword: string) =>
  (await api.post<Profile>('/account/email', { email, currentPassword })).data;

/** Событие: аватар изменился, компоненты Avatar перезагружают изображение */
export const AVATAR_EVENT = 'dormhub:avatar-changed';

const authHeader = (): Record<string, string> => {
  const token = sessionTokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Загрузка аватара: тело запроса — само изображение, а не JSON */
export async function uploadAvatar(image: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/account/avatar', {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': image.type || 'image/webp' },
      body: image,
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');
  }
  if (!response.ok) {
    let message = 'Не удалось загрузить аватар';
    try {
      message = ((await response.json()) as { message?: string }).message ?? message;
    } catch {
      // Тело не JSON
    }
    throw new ApiError(response.status, message);
  }
  window.dispatchEvent(new Event(AVATAR_EVENT));
}

export async function removeAvatar(): Promise<void> {
  await api.delete('/account/avatar');
  window.dispatchEvent(new Event(AVATAR_EVENT));
}

/** Временный адрес изображения (blob:) или null, если аватара нет */
export async function fetchAvatarUrl(): Promise<string | null> {
  try {
    const response = await fetch('/api/account/avatar', { headers: authHeader() });
    if (!response.ok) {
      return null;
    }
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}