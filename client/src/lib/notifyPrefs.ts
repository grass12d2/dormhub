/** Настройки уведомлений, хранятся в браузере (тот же ключ, что на странице «Уведомления») */

export const NOTIFY_KEY = 'dormhub.notifications';

export interface NotifyPrefs {
  news: boolean;
  push: boolean;
  chat: boolean;
}

export const NOTIFY_DEFAULTS: NotifyPrefs = { news: true, push: false, chat: true };

export function readNotifyPrefs(): NotifyPrefs {
  try {
    return { ...NOTIFY_DEFAULTS, ...(JSON.parse(localStorage.getItem(NOTIFY_KEY) ?? '{}') as Partial<NotifyPrefs>) };
  } catch {
    return NOTIFY_DEFAULTS;
  }
}

/** Идентификаторы объявлений, для которых окно уже показано в этой вкладке */
export const POPUP_SEEN_KEY = 'dormhub.announcement-popup-seen';

export function readSeenIds(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(POPUP_SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function writeSeenIds(ids: string[]): void {
  try {
    sessionStorage.setItem(POPUP_SEEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Не критично: окно может показаться повторно
  }
}