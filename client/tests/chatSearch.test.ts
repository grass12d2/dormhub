import { describe, expect, it } from 'vitest';
import { searchSnippet } from '../src/lib/chatSearch';

describe('searchSnippet', () => {
  it('короткий текст целиком, переносы схлопываются', () => {
    expect(searchSnippet('Где\n\nключ   от прачечной?', 'ключ')).toBe('Где ключ от прачечной?');
  });

  it('длинный текст обрезается вокруг совпадения без учёта регистра', () => {
    const text = `${'а'.repeat(100)} Ключ у вахтёра ${'б'.repeat(100)}`;
    const snippet = searchSnippet(text, 'КЛЮЧ', 10);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('Ключ у вахт');
    expect(snippet.length).toBeLessThanOrEqual(32);
  });

  it('без совпадения — начало текста', () => {
    expect(searchSnippet('Привет всем на этаже', 'xyz', 5)).toBe('Привет все…');
  });
});
