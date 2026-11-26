import { describe, expect, it } from 'vitest';
import { tidyText, toMarkdownTable } from '../src/lib/chatCopy';

describe('toMarkdownTable', () => {
  it('первая строка — заголовок, столбцы выровнены', () => {
    expect(
      toMarkdownTable([
        ['Имя', 'Комната'],
        ['Анна', '101'],
      ])
    ).toBe(['| Имя  | Комната |', '| ---- | ------- |', '| Анна | 101     |'].join('\n'));
  });

  it('недостающие ячейки дополняются, черта экранируется, переносы убираются', () => {
    expect(toMarkdownTable([['a', 'b'], ['x|y'], ['1\n2', '3']])).toBe(
      ['| a    | b   |', '| ---- | --- |', '| x\\|y |     |', '| 1 2  | 3   |'].join('\n')
    );
  });

  it('пустая таблица — пустая строка', () => {
    expect(toMarkdownTable([])).toBe('');
    expect(toMarkdownTable([[]])).toBe('');
  });
});

describe('tidyText', () => {
  it('не больше одной пустой строки, без пробелов в концах', () => {
    expect(tidyText('\n a  \n\n\n\nb\t\n')).toBe('a\n\nb');
  });
});
