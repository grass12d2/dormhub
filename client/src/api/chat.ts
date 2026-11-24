import { buildQuery } from './client';
import { sessionTokenStore } from './client';
import { api } from './index';

/** Событие: число непрочитанных или список чатов изменились */
export const CHAT_EVENT = 'dormhub:chat-changed';

export interface ChatSummary {
    id: number;
    kind: 'floor' | 'block' | 'direct';
    title: string;
    otherUserId: string | null;
    blockedByMe: boolean;
    lastMessage: { text: string; createdAt: string } | null;
    unread: number;
}

export interface ChatFile {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    expired: boolean;
}

export interface ChatMessage {
    id: number;
    senderId: string | null;
    senderName: string;
    body: string | null;
    bodyHtml: string | null;
    deleted: boolean;
    createdAt: string;
    replyTo: { id: number; senderName: string; text: string | null } | null;
    reactions: Record<string, number>;
    myReaction: string | null;
    files: ChatFile[];
}

export const listChats = async () => (await api.get<ChatSummary[]>('/chats')).data;

export const listMessages = async (chatId: number, params: { before?: number; limit?: number } = {}) =>
    (await api.get<ChatMessage[]>(`/chats/${chatId}/messages${buildQuery(params)}`)).data;

export const sendMessage = async (chatId: number, body: string) =>
    (await api.post<{ id: number }>(`/chats/${chatId}/messages`, { body })).data;

export const markChatRead = async (chatId: number) =>
    (await api.post<{ read: boolean }>(`/chats/${chatId}/read`)).data;

export const markAllChatsRead = async () => (await api.post<{ read: boolean }>('/chats/read-all')).data;

/** Аватар пользователя как blob-адрес; null, если аватара нет */
export async function fetchUserAvatarUrl(userId: string): Promise<string | null> {
    const token = sessionTokenStore.get();
    try {
        const response = await fetch(`/api/chats/avatar/${userId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return response.ok ? URL.createObjectURL(await response.blob()) : null;
    } catch {
        return null;
    }
}

export interface ChatPerson {
    userId: string;
    name: string;
    role: string;
    place: string | null;
}

export const searchPeople = async (q: string) =>
    (await api.get<ChatPerson[]>(`/chats/people${buildQuery({ q })}`)).data;

export const openDirectChat = async (userId: string) =>
    (await api.post<{ id: number }>('/chats/direct', { userId })).data.id;

export const getChatUnread = async () =>
    (await api.get<{ count: number }>('/chats/unread-count')).data.count;