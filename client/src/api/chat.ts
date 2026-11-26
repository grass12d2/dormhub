import { ApiError, buildQuery, sessionTokenStore } from './client';
import { api } from './index';

/** Событие: число непрочитанных или список чатов изменились */
export const CHAT_EVENT = 'dormhub:chat-changed';

export interface ChatSummary {
    id: number;
    kind: 'floor' | 'block' | 'direct';
    title: string;
    otherUserId: string | null;
    otherRole: 'admin' | 'student' | null;
    blockedByMe: boolean;
    blockedMe: boolean;
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
    /** Время последней правки; null — сообщение не изменялось */
    editedAt: string | null;
    replyTo: { id: number; senderName: string; text: string | null } | null;
    reactions: Partial<Record<ReactionKind, number>>;
    myReaction: ReactionKind | null;
    files: ChatFile[];
}

export interface ChatPerson {
    userId: string;
    name: string;
    role: string;
    place: string | null;
}

/** Карточка пользователя; place — только если просматривающему разрешено видеть комнату */
export interface ChatProfile {
    userId: string;
    name: string;
    role: 'admin' | 'student';
    age: number | null;
    /** Институт (код, например «ИИТА») и учебная группа */
    faculty: string | null;
    group: string | null;
    place: { buildingNumber: number; roomNumber: string } | null;
}

export interface ChatMember {
    userId: string;
    name: string;
    room: string;
}

export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

const authHeader = (): Record<string, string> => {
    const token = sessionTokenStore.get();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const listChats = async () => (await api.get<ChatSummary[]>('/chats')).data;

export const listMessages = async (chatId: number, params: { before?: number; limit?: number } = {}) =>
    (await api.get<ChatMessage[]>(`/chats/${chatId}/messages${buildQuery(params)}`)).data;

export const sendMessage = async (
    chatId: number,
    input: { body?: string; bodyHtml?: string; replyToId?: number }
) => (await api.post<{ id: number }>(`/chats/${chatId}/messages`, input)).data;

/** Правка своего сообщения: новый текст; ответ и вложения остаются прежними */
export const editMessage = async (chatId: number, messageId: number, input: { body?: string; bodyHtml?: string }) =>
    (await api.patch<{ edited: boolean }>(`/chats/${chatId}/messages/${messageId}`, input)).data;

export const markChatRead = async (chatId: number) =>
    (await api.post<{ read: boolean }>(`/chats/${chatId}/read`)).data;

export const markAllChatsRead = async () => (await api.post<{ read: boolean }>('/chats/read-all')).data;

export const getChatUnread = async () =>
    (await api.get<{ count: number }>('/chats/unread-count')).data.count;

export const searchPeople = async (q: string) =>
    (await api.get<ChatPerson[]>(`/chats/people${buildQuery({ q })}`)).data;

export const openDirectChat = async (userId: string) =>
    (await api.post<{ id: number }>('/chats/direct', { userId })).data.id;

export const getChatProfile = async (userId: string) =>
    (await api.get<ChatProfile>(`/chats/users/${userId}/profile`)).data;

export const listMembers = async (chatId: number) =>
    (await api.get<ChatMember[]>(`/chats/${chatId}/members`)).data;

/** kind = null снимает реакцию */
export const setReaction = async (chatId: number, messageId: number, kind: ReactionKind | null) =>
    (await api.put<{ kind: string | null }>(`/chats/${chatId}/messages/${messageId}/reaction`, { kind })).data;

export const deleteChatMessage = async (chatId: number, messageId: number) =>
    (await api.delete(`/chats/${chatId}/messages/${messageId}`)).data;

export const blockUser = async (userId: string) =>
    (await api.post<{ blocked: boolean }>('/chats/blocks', { userId })).data;

export const unblockUser = async (userId: string) => (await api.delete(`/chats/blocks/${userId}`)).data;

/** Загрузка файла к сообщению: тело запроса — сам файл */
export async function uploadChatFile(chatId: number, messageId: number, file: File): Promise<void> {
    let response: Response;
    try {
        response = await fetch(`/api/chats/${chatId}/messages/${messageId}/files?name=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', ...authHeader() },
            body: file,
        });
    } catch {
        throw new ApiError(0, 'Нет связи с сервером');
    }
    if (!response.ok) {
        const envelope = (await response.json().catch(() => ({}))) as { message?: string };
        throw new ApiError(response.status, envelope.message ?? 'Не удалось загрузить файл');
    }
}

export async function downloadChatFile(chatId: number, messageId: number, file: ChatFile): Promise<void> {
    const response = await fetch(`/api/chats/${chatId}/messages/${messageId}/files/${file.id}`, { headers: authHeader() });
    if (!response.ok) throw new ApiError(response.status, 'Не удалось скачать файл');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);
}

export async function fetchChatImageUrl(chatId: number, messageId: number, fileId: string): Promise<string | null> {
    try {
        const response = await fetch(`/api/chats/${chatId}/messages/${messageId}/files/${fileId}`, { headers: authHeader() });
        return response.ok ? URL.createObjectURL(await response.blob()) : null;
    } catch {
        return null;
    }
}

/** Аватар пользователя как blob-адрес; null, если аватара нет */
export async function fetchUserAvatarUrl(userId: string): Promise<string | null> {
    try {
        const response = await fetch(`/api/chats/avatar/${userId}`, { headers: authHeader() });
        return response.ok ? URL.createObjectURL(await response.blob()) : null;
    } catch {
        return null;
    }
}