import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_SWATCH,
  DEFAULT_SETTINGS,
  FONT_SCALE,
  FONT_SIZES,
  MODES,
  MODE_LABELS,
  THEME_STORAGE_KEY,
  parseSettings,
  resolveMode,
  serializeSettings,
} from '../src/theme/theme';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('parseSettings', () => {
  it('без значения: синий акцент, режим «как в системе», обычный размер', () => {
    expect(parseSettings(null)).toEqual({ mode: 'system', accent: 'blue', fontSize: 3 });
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('повреждённый JSON даёт настройки по умолчанию', () => {
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('неверное поле заменяется значением по умолчанию, верное сохраняется', () => {
    expect(parseSettings('{"mode":"dark","accent":"neon"}')).toEqual({
      mode: 'dark',
      accent: 'blue',
      fontSize: 3,
    });
    expect(parseSettings('{"mode":"auto","accent":"red"}')).toEqual({
      mode: 'system',
      accent: 'red',
      fontSize: 3,
    });
  });

  it.each(ACCENTS)('цвет %s сохраняется и читается без потерь', (accent) => {
    for (const mode of MODES) {
      const settings = { mode, accent, fontSize: 3 as const };
      expect(parseSettings(serializeSettings(settings))).toEqual(settings);
    }
  });
});

describe('resolveMode', () => {
  it('светлая, тёмная и пастельная не зависят от системы', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
    expect(resolveMode('pastel', true)).toBe('pastel');
    expect(resolveMode('pastel', false)).toBe('pastel');
  });

  it('«как в системе» следует системе и никогда не даёт пастельную тему', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });
});

describe('справочники', () => {
  it('десять цветов, у каждого есть название и образец', () => {
    expect(ACCENTS).toHaveLength(10);
    expect(new Set(ACCENTS).size).toBe(10);
    for (const accent of ACCENTS) {
      expect(ACCENT_LABELS[accent]).toBeTruthy();
      expect(ACCENT_SWATCH[accent]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('четыре режима, у каждого есть название', () => {
    expect(MODES).toEqual(['light', 'dark', 'pastel', 'system']);
    for (const mode of MODES) {
      expect(MODE_LABELS[mode]).toBeTruthy();
    }
  });
});

describe('размер текста', () => {
  it('пять уровней, обычный (3) равен 100%, значения возрастают', () => {
    expect(FONT_SIZES).toHaveLength(5);
    expect(FONT_SCALE[3]).toBe(100);
    const values = FONT_SIZES.map((size) => FONT_SCALE[size]);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('допустимый уровень читается, недопустимый заменяется обычным', () => {
    expect(parseSettings('{"fontSize":5}').fontSize).toBe(5);
    expect(parseSettings('{"fontSize":9}').fontSize).toBe(3);
    expect(parseSettings('{"fontSize":"большой"}').fontSize).toBe(3);
  });
});

describe('согласованность с index.css и theme-init.js', () => {
  const css = read('../src/index.css');
  const init = read('../public/theme-init.js');

  it('для каждого цвета в CSS есть блок со светлым образцом и вариантом для тёмной темы', () => {
    for (const accent of ACCENTS) {
      const block = css.match(new RegExp(`\\[data-accent="${accent}"\\]\\s*\\{([^}]*)\\}`));
      expect(block, `нет блока для ${accent}`).not.toBeNull();
      expect(block?.[1]).toContain(`--accent-light: ${ACCENT_SWATCH[accent]}`);
      expect(block?.[1]).toMatch(/--accent-dark: #[0-9a-f]{6}/);
    }
  });

  it('в CSS есть блоки всех тем', () => {
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="pastel"]');
  });

  it('theme-init.js знает те же цвета, режимы, уровни размера и ключ хранилища', () => {
    for (const accent of ACCENTS) {
      expect(init).toContain(`'${accent}'`);
    }
    for (const mode of MODES) {
      expect(init).toContain(`'${mode}'`);
    }
    for (const percent of Object.values(FONT_SCALE)) {
      expect(init).toContain(String(percent));
    }
    expect(init).toContain(`'${THEME_STORAGE_KEY}'`);
  });
});