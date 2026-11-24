/** Раскладка сообщений: разделители дней и группы подряд идущих сообщений одного автора */

import type { ChatMessage } from '../api/chat';

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'group'; key: string; senderId: string | null; senderName: string; messages: ChatMessage[] };

const DAY = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const FULL = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Ключ дня по местному времени: ГГГГ-ММ-ДД */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const formatDay = (iso: string): string => DAY.format(new Date(iso));
export const formatTime = (iso: string): string => TIME.format(new Date(iso));
/** Полная дата и время: ДД.ММ.ГГГГ, ЧЧ:ММ */
export const formatFull = (iso: string): string => FULL.format(new Date(iso));

/** Объединяет старые и свежие сообщения; свежие заменяют старые с тем же id (реакции, удаление) */
export function mergeMessages(prev: ChatMessage[], fresh: ChatMessage[]): ChatMessage[] {
  const map = new Map<number, ChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of fresh) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

/** Строки ленты: разделитель при смене дня, новая группа при смене автора или дня */
export function buildRows(messages: ChatMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = '';
  let current: Extract<ChatRow, { kind: 'group' }> | null = null;
  for (const message of messages) {
    const day = dayKey(message.createdAt);
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, label: formatDay(message.createdAt) });
      lastDay = day;
      current = null;
    }
    if (!current || current.senderId !== message.senderId) {
      current = {
        kind: 'group',
        key: `group-${message.id}`,
        senderId: message.senderId,
        senderName: message.senderName,
        messages: [],
      };
      rows.push(current);
    }
    current.messages.push(message);
  }
  return rows;
}