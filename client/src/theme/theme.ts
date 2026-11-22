/** Настройки темы: режим, цвет акцента и размер текста. Чистая логика без обращения к браузеру. */

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

/** Пастельный режим: светлый фон, подкрашенный цветом акцента */
export const MODES = ['light', 'dark', 'pastel', 'system'] as const;
export type Mode = (typeof MODES)[number];

export const FONT_SIZES = [1, 2, 3, 4, 5] as const;
export type FontSize = (typeof FONT_SIZES)[number];
/** Масштаб корневого шрифта для каждого уровня (3 — обычный, 100%) */
export const FONT_SCALE: Record<FontSize, number> = { 1: 90, 2: 95, 3: 100, 4: 108, 5: 116 };

export const DEFAULT_ACCENT: Accent = 'blue';
export const DEFAULT_MODE: Mode = 'system';
export const DEFAULT_FONT_SIZE: FontSize = 3;
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
    pastel: 'Пастельная',
    system: 'Система',
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
    fontSize: FontSize;
}

export const DEFAULT_SETTINGS: ThemeSettings = {
    mode: DEFAULT_MODE,
    accent: DEFAULT_ACCENT,
    fontSize: DEFAULT_FONT_SIZE,
};

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
        const fontSize = FONT_SIZES.find((item) => item === record.fontSize) ?? DEFAULT_FONT_SIZE;
        return { mode, accent, fontSize };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function serializeSettings(settings: ThemeSettings): string {
    return JSON.stringify({
        mode: settings.mode,
        accent: settings.accent,
        fontSize: settings.fontSize,
    });
}

/**
 * Итоговая тема. «Как в системе» берёт светлую или тёмную по настройке системы
 * (никогда не пастельную); остальные режимы не зависят от системы.
 */
export function resolveMode(mode: Mode, systemPrefersDark: boolean): 'light' | 'dark' | 'pastel' {
    if (mode === 'system') {
        return systemPrefersDark ? 'dark' : 'light';
    }
    return mode;
}