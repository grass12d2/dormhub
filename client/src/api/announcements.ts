import { ApiError, buildQuery, sessionTokenStore, type PageMeta } from './client';
import { api } from './index';

export type AnnouncementTarget =
  | { roomId: string }
  | { buildingId: string; floor?: number };

/** Вложение объявления (содержимое скачивается отдельным запросом) */
export interface AnnouncementFile {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  bodyHtml: string | null;
  expiresAt: string | null;
  createdAt: string;
  isRead: boolean;
  targets: AnnouncementTarget[];
  files: AnnouncementFile[];
}

export interface AnnouncementInput {
  title: string;
  /** HTML из редактора (сервер очищает его и сам вычисляет простой текст) */
  bodyHtml: string;
  targets: AnnouncementTarget[];
  expiresAt: string | null;
}

export interface AnnouncementPage {
  items: Announcement[];
  meta: PageMeta;
}

export async function listAnnouncements(params: { limit: number; offset: number }): Promise<AnnouncementPage> {
  const response = await api.get<Announcement[]>(`/announcements${buildQuery(params)}`);
  return {
    items: response.data,
    meta: response.meta ?? { total: response.data.length, limit: params.limit, offset: params.offset },
  };
}

export const createAnnouncement = async (input: AnnouncementInput) =>
  (await api.post<{ id: string }>('/announcements', input)).data;

export const replaceAnnouncement = async (id: string, input: AnnouncementInput) =>
  (await api.put<{ id: string }>(`/announcements/${id}`, input)).data;

export const deleteAnnouncement = async (id: string) => (await api.delete(`/announcements/${id}`)).data;

export const markAnnouncementRead = async (id: string) =>
  (await api.post<{ id: string }>(`/announcements/${id}/read`)).data;

export const getUnreadCount = async () =>
  (await api.get<{ count: number }>('/announcements/unread-count')).data.count;

export const markAllAnnouncementsRead = async () =>
  (await api.post<{ marked: number }>('/announcements/read-all')).data.marked;

const authHeader = (): Record<string, string> => {
  const token = sessionTokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Загрузка файла: тело запроса — сам файл, имя передаётся в адресе */
export async function uploadAnnouncementFile(announcementId: string, file: File): Promise<AnnouncementFile> {
  let response: Response;
  try {
    response = await fetch(`/api/announcements/${announcementId}/files?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', ...authHeader() },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');
  }
  const envelope = (await response.json().catch(() => ({}))) as { data?: AnnouncementFile; message?: string };
  if (!response.ok || !envelope.data) {
    throw new ApiError(response.status, envelope.message ?? 'Не удалось загрузить файл');
  }
  return envelope.data;
}

export const deleteAnnouncementFile = async (announcementId: string, fileId: string) =>
  (await api.delete(`/announcements/${announcementId}/files/${fileId}`)).data;

/** Скачивание с токеном: файл сохраняется через временную ссылку */
export async function downloadAnnouncementFile(announcementId: string, file: AnnouncementFile): Promise<void> {
  const response = await fetch(`/api/announcements/${announcementId}/files/${file.id}`, {
    headers: authHeader(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Не удалось скачать файл');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Адрес изображения для превью (blob:); вызывающий освобождает его через URL.revokeObjectURL */
export async function fetchAnnouncementImageUrl(announcementId: string, fileId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/announcements/${announcementId}/files/${fileId}`, {
      headers: authHeader(),
    });
    return response.ok ? URL.createObjectURL(await response.blob()) : null;
  } catch {
    return null;
  }
}