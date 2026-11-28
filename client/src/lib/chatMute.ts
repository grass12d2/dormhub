/** Отключение уведомлений беседы: хранится в браузере; until = -1 — пока не включат снова */
const KEY = 'dormhub.chat-mutes';

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function write(value: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Хранилище недоступно: настройка не сохранится
  }
}

export function isMuted(chatId: number, now = Date.now()): boolean {
  const until = read()[String(chatId)];
  return until === -1 || (until !== undefined && until > now);
}

/** durationMs = null — навсегда */
export function muteChat(chatId: number, durationMs: number | null): void {
  write({ ...read(), [String(chatId)]: durationMs === null ? -1 : Date.now() + durationMs });
}

export function unmuteChat(chatId: number): void {
  const all = read();
  delete all[String(chatId)];
  write(all);
}
/** До какого момента отключены уведомления: -1 — бессрочно, null — не отключены (или срок прошёл) */
export function muteUntil(chatId: number, now = Date.now()): number | null {
  const until = read()[String(chatId)];
  if (until === -1) return -1;
  return until !== undefined && until > now ? until : null;
}

/** Сколько ещё отключены уведомления: «2 ч 15 мин», «40 мин»; бессрочно — «пока не включите» */
export function muteLeftLabel(until: number, now = Date.now()): string {
  if (until === -1) return 'пока не включите';
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
