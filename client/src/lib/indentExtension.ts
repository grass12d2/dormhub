import { Extension } from '@tiptap/react';

/**
 * Отступ абзаца или заголовка, уровень 0–8, шаг 2rem.
 * Выравнивание слева и по центру: красная строка (text-indent).
 * Выравнивание справа: отступ от правого края (padding-right).
 * Для пункта списка отступ сдвигает весь пункт вместе с маркером (margin-left).
 */
export const Indent = Extension.create({
    name: 'indent',
    addGlobalAttributes() {
        return [
            {
                types: ['paragraph', 'heading'],
                attributes: {
                    indent: {
                        default: 0,
                        parseHTML: (element: HTMLElement) => {
                            const value = parseInt(element.style.textIndent || element.style.paddingRight, 10) || 0;
                            return Math.round(value / 2);
                        },
                        renderHTML: (attributes: Record<string, unknown>) => {
                            const level = Number(attributes.indent) || 0;
                            if (level <= 0) return {};
                            const property = attributes.textAlign === 'right' ? 'padding-right' : 'text-indent';
                            return { style: `${property}: ${level * 2}rem` };
                        },
                    },
                },
            },
            {
                types: ['listItem'],
                attributes: {
                    indent: {
                        default: 0,
                        parseHTML: (element: HTMLElement) => Math.round((parseInt(element.style.marginLeft, 10) || 0) / 2),
                        renderHTML: (attributes: Record<string, unknown>) =>
                            Number(attributes.indent) > 0 ? { style: `margin-left: ${Number(attributes.indent) * 2}rem` } : {},
                    },
                },
            },
        ];
    },
});