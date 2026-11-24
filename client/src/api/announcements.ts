import { buildQuery, type PageMeta } from './client';
import { api } from './index';

export type AnnouncementTarget =
    | { roomId: string }
    | { buildingId: string; floor?: number };

export interface Announcement {
    id: string;
    title: string;
    body: string;
    bodyHtml: string | null;
    expiresAt: string | null;
    createdAt: string;
    isRead: boolean;
    targets: AnnouncementTarget[];
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