/** Очистка HTML объявлений: только разрешённые теги и безопасные атрибуты */

import sanitizeHtml from 'sanitize-html';

export const MAX_HTML_LENGTH = 20_000;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 'sub', 'sup', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h2', 'h3', 'span', 'a',
  ],
  allowedAttributes: {
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
    span: ['style'],
    li: ['style'],
    a: ['href', 'target', 'rel'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  // Стили: выравнивание, отступы (целые rem) и цвет текста в виде #rrggbb
  allowedStyles: {
    '*': {
      'text-align': [/^(left|center|right)$/],
      'text-indent': [/^\d{1,2}rem$/],
      'margin-left': [/^\d{1,2}rem$/],
      'padding-right': [/^\d{1,2}rem$/],
    },
    span: { color: [/^#[0-9a-f]{6}$/i] },
  },
  // Ссылки: только http, https и mailto; всегда в новой вкладке без доступа к окну-источнику
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
  // Содержимое этих тегов удаляется целиком, а не превращается в текст
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
  disallowedTagsMode: 'discard',
};

export function sanitizeAnnouncementHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Простой текст из HTML: для предпросмотра, поиска и проверки «текст не пуст» */
export function htmlToText(html: string): string {
  // Границы блоков заменяются пробелом, чтобы соседние абзацы и ячейки не склеивались
  const spaced = html.replace(/<\/(p|li|td|th|tr|h2|h3|ul|ol|table|thead|tbody)>|<br\s*\/?>/gi, ' ');
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['script', 'style'] })
    .replace(/\s+/g, ' ')
    .trim();
}