import { describe, expect, it } from 'vitest';
import { htmlToText, sanitizeAnnouncementHtml } from '../../src/utils/html.js';

describe('sanitizeAnnouncementHtml', () => {
  it('оставляет разрешённое форматирование', () => {
    const html = '<p><strong>Важно</strong> и <em>курсив</em> и <u>подчёркнуто</u></p><ul><li>раз</li></ul>';
    expect(sanitizeAnnouncementHtml(html)).toBe(html);
  });

  it('оставляет таблицу', () => {
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeAnnouncementHtml(html)).toBe(html);
  });

  it.each([
    ['<script>alert(1)</script><p>ok</p>', '<p>ok</p>'],
    ['<p onclick="x()">текст</p>', '<p>текст</p>'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<a href="javascript:alert(1)">ссылка</a>', 'ссылка'],
    ['<p style="color:red">текст</p>', '<p>текст</p>'],
    ['<iframe src="http://evil"></iframe><p>ok</p>', '<p>ok</p>'],
    ['<style>p{}</style><p>ok</p>', '<p>ok</p>'],
    ['<svg onload=alert(1)></svg><p>ok</p>', '<p>ok</p>'],
  ])('опасная разметка %j обезвреживается', (input, expected) => {
    expect(sanitizeAnnouncementHtml(input)).toBe(expected);
  });
});

describe('htmlToText', () => {
  it('убирает теги и схлопывает пробелы', () => {
    expect(htmlToText('<p>Привет,</p><p><strong>мир</strong></p>')).toBe('Привет, мир');
    expect(htmlToText('<script>x</script>')).toBe('');
  });
});