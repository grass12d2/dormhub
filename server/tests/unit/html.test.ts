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
    ['<p style="color:red">текст</p>', '<p>текст</p>'],
    ['<iframe src="http://evil"></iframe><p>ok</p>', '<p>ok</p>'],
    ['<style>p{}</style><p>ok</p>', '<p>ok</p>'],
    ['<svg onload=alert(1)></svg><p>ok</p>', '<p>ok</p>'],
  ])('опасная разметка %j обезвреживается', (input, expected) => {
    expect(sanitizeAnnouncementHtml(input)).toBe(expected);
  });

  it('оставляет индексы и выравнивание, но не другие стили', () => {
    expect(sanitizeAnnouncementHtml('<p>H<sub>2</sub>O x<sup>2</sup></p>')).toBe('<p>H<sub>2</sub>O x<sup>2</sup></p>');
    expect(sanitizeAnnouncementHtml('<p style="text-align: center">а</p>')).toMatch(/^<p style="text-align:\s?center">а<\/p>$/);
    expect(sanitizeAnnouncementHtml('<p style="text-align:center;color:red">а</p>')).not.toContain('color');
    expect(sanitizeAnnouncementHtml('<p style="text-align:justify">а</p>')).toBe('<p>а</p>');
  });

  it('опасная ссылка теряет href, обычная получает target и rel', () => {
    const bad = sanitizeAnnouncementHtml('<a href="javascript:alert(1)">ссылка</a>');
    expect(bad).not.toContain('javascript');
    expect(bad).toContain('ссылка');
    const good = sanitizeAnnouncementHtml('<a href="https://example.com" onclick="x()">сайт</a>');
    expect(good).toContain('href="https://example.com"');
    expect(good).toContain('target="_blank"');
    expect(good).toContain('rel="noopener noreferrer"');
    expect(good).not.toContain('onclick');
    expect(sanitizeAnnouncementHtml('<a href="mailto:a@b.ru">почта</a>')).toContain('mailto:a@b.ru');
  });

  it('цвет только #rrggbb, отступы только целыми rem', () => {
    expect(sanitizeAnnouncementHtml('<p><span style="color: #2563eb">а</span></p>')).toContain('#2563eb');
    expect(sanitizeAnnouncementHtml('<span style="color: red">а</span>')).not.toContain('color');
    expect(sanitizeAnnouncementHtml('<p style="text-indent: 4rem">а</p>')).toContain('text-indent');
    expect(sanitizeAnnouncementHtml('<p style="text-indent: 99px">а</p>')).toBe('<p>а</p>');
    expect(sanitizeAnnouncementHtml('<p style="padding-right: 2rem">а</p>')).toContain('padding-right');
    expect(sanitizeAnnouncementHtml('<p style="padding-right: 5px">а</p>')).toBe('<p>а</p>');
    expect(sanitizeAnnouncementHtml('<p style="position:fixed">а</p>')).toBe('<p>а</p>');
  });

  it('отступ пункта списка допускается только целыми rem', () => {
    expect(sanitizeAnnouncementHtml('<ul><li style="margin-left: 2rem">а</li></ul>')).toContain('margin-left');
    expect(sanitizeAnnouncementHtml('<ul><li style="margin-left: 9px">а</li></ul>')).toBe('<ul><li>а</li></ul>');
  });

});

describe('htmlToText', () => {
  it('убирает теги и разделяет абзацы пробелом', () => {
    expect(htmlToText('<p>Привет,</p><p><strong>мир</strong></p>')).toBe('Привет, мир');
    expect(htmlToText('<script>x</script>')).toBe('');
  });
});