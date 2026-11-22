/** Настройки темы: режим и цвет акцента. Чистая логика без обращения к браузеру. */

export const ACCENTS = [
  'blue',
  'indigo',
  'purple',
  'pink',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'cyan',
] as const;
export type Accent = (typeof ACCENTS)[number];

export const MODES = ['light', 'dark', 'system'] as const;
export type Mode = (typeof MODES)[number];

export const DEFAULT_ACCENT: Accent = 'blue';
export const DEFAULT_MODE: Mode = 'system';
export const THEME_STORAGE_KEY = 'dormhub.theme';

export const ACCENT_LABELS: Record<Accent, string> = {
  blue: 'Синий',
  indigo: 'Индиго',
  purple: 'Фиолетовый',
  pink: 'Розовый',
  red: 'Красный',
  orange: 'Оранжевый',
  amber: 'Янтарный',
  green: 'Зелёный',
  teal: 'Бирюзовый',
  cyan: 'Голубой',
};

export const MODE_LABELS: Record<Mode, string> = {
  light: 'Светлая',
  dark: 'Тёмная',
  system: 'Как в системе',
};

/** Цвета образцов в переключателе (совпадают со светлой темой в index.css) */
export const ACCENT_SWATCH: Record<Accent, string> = {
  blue: '#2563eb',
  indigo: '#4f46e5',
  purple: '#9333ea',
  pink: '#db2777',
  red: '#dc2626',
  orange: '#c2410c',
  amber: '#b45309',
  green: '#15803d',
  teal: '#0f766e',
  cyan: '#0e7490',
};

export interface ThemeSettings {
  mode: Mode;
  accent: Accent;
}

export const DEFAULT_SETTINGS: ThemeSettings = { mode: DEFAULT_MODE, accent: DEFAULT_ACCENT };

/** Разобрать сохранённую строку; любое неверное поле заменяется значением по умолчанию */
export function parseSettings(raw: string | null): ThemeSettings {
  if (!raw) {
    return DEFAULT_SETTINGS;
  }
  try {
    const data: unknown = JSON.parse(raw);
    const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const mode = MODES.find((item) => item === record.mode) ?? DEFAULT_MODE;
    const accent = ACCENTS.find((item) => item === record.accent) ?? DEFAULT_ACCENT;
    return { mode, accent };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function serializeSettings(settings: ThemeSettings): string {
  return JSON.stringify({ mode: settings.mode, accent: settings.accent });
}

/** Итоговая тема: «как в системе» берёт предпочтение операционной системы */
export function resolveMode(mode: Mode, systemPrefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return mode;
}