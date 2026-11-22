import { describe, expect, it } from 'vitest';
import { isMacLike, modifierLabel } from '../src/lib/platform';
import { navFor } from '../src/nav';
import { SEARCH_TYPES, searchUrl } from '../src/search';

describe('платформа', () => {
  it.each(['MacIntel', 'iPhone', 'iPad', 'macOS'])('%s считается Mac', (platform) => {
    expect(isMacLike(platform)).toBe(true);
    expect(modifierLabel(platform)).toBe('⌘');
  });

  it.each(['Win32', 'Linux x86_64', 'Android', ''])('«%s» даёт Ctrl', (platform) => {
    expect(isMacLike(platform)).toBe(false);
    expect(modifierLabel(platform)).toBe('Ctrl');
  });
});

describe('searchUrl', () => {
  it('добавляет закодированный запрос', () => {
    expect(searchUrl('/students', ' Иван ')).toBe('/students?q=%D0%98%D0%B2%D0%B0%D0%BD');
  });

  it('пустой запрос даёт путь без параметров', () => {
    expect(searchUrl('/rooms', '   ')).toBe('/rooms');
  });
});

describe('виды поиска', () => {
  it('каждый ведёт в раздел меню администратора, идентификаторы уникальны', () => {
    const adminPaths = navFor('admin').map((item) => item.path);
    for (const type of SEARCH_TYPES) {
      expect(adminPaths, type.label).toContain(type.path);
    }
    expect(new Set(SEARCH_TYPES.map((type) => type.id)).size).toBe(SEARCH_TYPES.length);
  });
});