import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_SWATCH,
  DEFAULT_SETTINGS,
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
  it('без значения: синий акцент и режим «как в системе»', () => {
    expect(parseSettings(null)).toEqual({ mode: 'system', accent: 'blue' });
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('повреждённый JSON даёт настройки по умолчанию', () => {
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('неверное поле заменяется значением по умолчанию, верное сохраняется', () => {
    expect(parseSettings('{"mode":"dark","accent":"neon"}')).toEqual({ mode: 'dark', accent: 'blue' });
    expect(parseSettings('{"mode":"auto","accent":"red"}')).toEqual({ mode: 'system', accent: 'red' });
  });

  it.each(ACCENTS)('цвет %s сохраняется и читается без потерь', (accent) => {
    for (const mode of MODES) {
      expect(parseSettings(serializeSettings({ mode, accent }))).toEqual({ mode, accent });
    }
  });
});

describe('resolveMode', () => {
  it('светлая и тёмная не зависят от системы', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('«как в системе» следует предпочтению системы', () => {
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
    for (const mode of MODES) {
      expect(MODE_LABELS[mode]).toBeTruthy();
    }
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

  it('theme-init.js знает те же цвета и тот же ключ хранилища', () => {
    for (const accent of ACCENTS) {
      expect(init).toContain(`'${accent}'`);
    }
    expect(init).toContain(`'${THEME_STORAGE_KEY}'`);
  });
});