import { describe, expect, it } from 'vitest';
import { splitHighlight } from '../src/lib/highlight';

describe('splitHighlight', () => {
  it('без запроса возвращает текст целиком', () => {
    expect(splitHighlight('Прачечная', '  ')).toEqual([{ text: 'Прачечная', match: false }]);
  });

  it('находит все вхождения без учёта регистра', () => {
    expect(splitHighlight('Стирка и стиральные машины', 'СТИР')).toEqual([
      { text: 'Стир', match: true },
      { text: 'ка и ', match: false },
      { text: 'стир', match: true },
      { text: 'альные машины', match: false },
    ]);
  });

  it('подсвечивает несколько слов и экранирует спецсимволы', () => {
    expect(splitHighlight('Хлопок 60° (бельё)', '60° (бельё)').filter((p) => p.match).map((p) => p.text)).toEqual(['60°', '(бельё)']);
  });
});
