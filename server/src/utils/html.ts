/** Очистка HTML объявлений: только разрешённые теги, без атрибутов и ссылок */

import sanitizeHtml from 'sanitize-html';

export const MAX_HTML_LENGTH = 20_000;

const OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h2', 'h3',
    ],
    allowedAttributes: {},
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