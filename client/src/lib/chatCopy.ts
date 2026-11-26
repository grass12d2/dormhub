/** Копирование сообщений чата: время и служебные подписи не попадают в буфер, таблицы — в виде Markdown */

/** Атрибут элементов, которые не копируются (время, разделители дней, реакции) */
export const NO_COPY_ATTR = 'data-nocopy';

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE']);

/** Ячейка Markdown-таблицы: одна строка, вертикальная черта экранируется */
const cellText = (s: string): string => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();

/** Таблица Markdown из строк ячеек: первая строка — заголовок, столбцы выровнены по ширине */
export function toMarkdownTable(rows: string[][]): string {
    const body = rows.filter((r) => r.length > 0).map((r) => r.map(cellText));
    if (body.length === 0) return '';
    const cols = Math.max(...body.map((r) => r.length));
    const full = body.map((r) => [...r, ...Array<string>(cols - r.length).fill('')]);
    const width = Array.from({ length: cols }, (_, c) => Math.max(3, ...full.map((r) => [...r[c]].length)));
    const line = (r: string[]) => `| ${r.map((v, c) => v + ' '.repeat(width[c] - [...v].length)).join(' | ')} |`;
    const sep = `| ${width.map((w) => '-'.repeat(w)).join(' | ')} |`;
    return [line(full[0]), sep, ...full.slice(1).map(line)].join('\n');
}

/** Склейка: не более одной пустой строки подряд, без пробелов в концах строк и по краям */
export function tidyText(s: string): string {
    return s
        .split('\n')
        .map((l) => l.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Текст узла DOM: абзацы и пункты списков с новой строки, таблицы — Markdown, помеченное NO_COPY_ATTR пропускается */
export function nodeToText(root: Node): string {
    let out = '';
    // Маркер пункта списка ставится перед первым текстом пункта (внутри <li> обычно лежит <p>)
    let marker = '';
    const newline = () => {
        if (out && !out.endsWith('\n')) out += '\n';
    };
    const emit = (text: string) => {
        if (marker && text) {
            out += marker;
            marker = '';
        }
        out += text;
    };

    const tableText = (table: ParentNode): string => {
        const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
            Array.from(tr.children)
                .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
                .map((c) => tidyText(nodeToText(c)))
        );
        return toMarkdownTable(rows);
    };

    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            emit(node.textContent ?? '');
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        const el = node as Element;
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (el.hasAttribute(NO_COPY_ATTR)) return;
            const tag = el.tagName;
            if (tag === 'BR') {
                emit('\n');
                return;
            }
            if (tag === 'TABLE') {
                newline();
                out += `\n${tableText(el)}\n\n`;
                return;
            }
            if (BLOCKS.has(tag)) {
                newline();
                if (tag === 'LI') {
                    const parent = el.parentElement;
                    const index = parent ? Array.from(parent.children).indexOf(el) + 1 : 1;
                    // Вложенные списки сдвигаются на два пробела за уровень
                    let depth = 0;
                    for (let a = parent?.parentElement; a && a !== root; a = a.parentElement) {
                        if (a.tagName === 'UL' || a.tagName === 'OL') depth += 1;
                    }
                    marker = '  '.repeat(depth) + (parent?.tagName === 'OL' ? `${index}. ` : '- ');
                }
                el.childNodes.forEach(walk);
                newline();
                return;
            }
        }
        node.childNodes.forEach(walk);
    };

    // Выделение внутри одной таблицы: во фрагменте есть строки, но нет самого <table>
    if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const frag = root as DocumentFragment;
        if (!frag.querySelector('table') && frag.querySelector('tr')) return tidyText(tableText(frag));
    }
    walk(root);
    return tidyText(out);
}

/** Текст сообщения для пункта меню «Копировать»: из HTML (если есть) или исходный текст */
export function messageCopyText(body: string | null, bodyHtml: string | null | undefined): string {
    if (!bodyHtml) return body ?? '';
    // DOMParser создаёт неактивный документ: скрипты и загрузки не выполняются
    const doc = new DOMParser().parseFromString(bodyHtml, 'text/html');
    return nodeToText(doc.body);
}
