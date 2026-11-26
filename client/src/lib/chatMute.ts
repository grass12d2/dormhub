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