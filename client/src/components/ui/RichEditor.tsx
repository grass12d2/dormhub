import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    Heading2,
    IndentDecrease,
    IndentIncrease,
    Italic,
    Link2,
    List,
    ListOrdered,
    Minus,
    Palette,
    Paperclip,
    Plus,
    Redo2,
    Subscript as SubIcon,
    Superscript as SupIcon,
    Table as TableIcon,
    Trash2,
    Underline as UnderlineIcon,
    Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { Indent } from '../../lib/indentExtension';
import { ACCENTS, ACCENT_LABELS, ACCENT_SWATCH } from '../../theme/theme';
import { RICH_CLASS } from './RichText';

interface Props {
    /** Начальный HTML (при редактировании) */
    value: string;
    onChange: (html: string) => void;
    invalid?: boolean;
}

const GRID = 8;
/** Расстояние до границы ячейки (px), при котором появляется «+» */
const EDGE = 10;
/** Задержка скрытия кнопок таблицы, мс: хватает, чтобы довести курсор до кнопки */
const HIDE_DELAY = 600;

const tool = (active: boolean) =>
    `flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${active ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2'
    }`;

function Tool({ label, active = false, disabled, onClick, children }: {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            className={tool(active)}
            // Кнопка не забирает фокус у редактора, выделение сохраняется
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** Группа кнопок: при нехватке места переносится на новую строку целиком */
const Group = ({ children }: { children: ReactNode }) => (
    <div className="flex shrink-0 items-center gap-1">{children}</div>
);

/** Закрытие всплывающей панели по щелчку снаружи и по Esc */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!open) return;
        const down = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) close();
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('mousedown', down);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', down);
            document.removeEventListener('keydown', key);
        };
    }, [open, close, ref]);
}

/** Сдвиг панели по горизонтали, чтобы она не выходила за левый и правый край экрана */
function usePanelShift(open: boolean, ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
    const [shift, setShift] = useState(0);
    useEffect(() => {
        if (!open || !ref.current) {
            setShift(0);
            return;
        }
        // Измерение без прежнего сдвига
        const rect = ref.current.getBoundingClientRect();
        const margin = 8;
        const left = rect.left - shift;
        const right = rect.right - shift;
        let dx = 0;
        if (right > window.innerWidth - margin) dx = window.innerWidth - margin - right;
        if (left + dx < margin) dx = margin - left;
        setShift(dx);
        // shift намеренно не в зависимостях: он вычисляется из измерения
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, ref, ...deps]);
    return shift;
}

/** Выбор цвета текста из десяти цветов темы */
function ColorPicker({ editor }: { editor: Editor }) {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    useDismiss(open, () => setOpen(false), box);
    const shift = usePanelShift(open, panel);
    const current = (editor.getAttributes('textStyle').color as string | undefined) ?? null;

    return (
        <div ref={box} className="relative">
            <Tool label="Цвет текста" active={open || current !== null} onClick={() => setOpen((p) => !p)}>
                <Palette size={16} />
            </Tool>
            {open ? (
                <div
                    ref={panel}
                    style={{ transform: `translateX(${shift}px)` }}
                    className="animate-pop-in absolute top-full left-0 z-50 mt-1 w-max rounded-xl border border-border bg-surface p-3 shadow-pop"
                >
                    <div className="grid grid-cols-5 gap-2">
                        {ACCENTS.map((accent) => (
                            <button
                                key={accent}
                                type="button"
                                aria-label={ACCENT_LABELS[accent]}
                                title={ACCENT_LABELS[accent]}
                                style={{ backgroundColor: ACCENT_SWATCH[accent] }}
                                className={`size-6 rounded-full ring-offset-2 ring-offset-surface ${current === ACCENT_SWATCH[accent] ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border'}`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    editor.chain().focus().setColor(ACCENT_SWATCH[accent]).run();
                                    setOpen(false);
                                }}
                            />
                        ))}
                    </div>
                    <button
                        type="button"
                        className="mt-3 h-8 w-full rounded-md border border-border text-sm hover:bg-surface-2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            editor.chain().focus().unsetColor().run();
                            setOpen(false);
                        }}
                    >
                        Сбросить цвет
                    </button>
                </div>
            ) : null}
        </div>
    );
}

/** Ссылка: ввод адреса (http, https или mailto); пустой адрес снимает ссылку */
function LinkTool({ editor }: { editor: Editor }) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const box = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    useDismiss(open, () => setOpen(false), box);
    const shift = usePanelShift(open, panel);

    const toggle = () => {
        if (!open) setUrl((editor.getAttributes('link').href as string | undefined) ?? '');
        setOpen((p) => !p);
    };
    const apply = () => {
        const value = url.trim();
        const href = value && !/^(https?:|mailto:)/i.test(value) ? (value.includes('@') ? `mailto:${value}` : `https://${value}`) : value;
        if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        else editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setOpen(false);
    };

    return (
        <div ref={box} className="relative">
            <Tool label="Ссылка" active={open || editor.isActive('link')} onClick={toggle}>
                <Link2 size={16} />
            </Tool>
            {open ? (
                <div
                    ref={panel}
                    style={{ transform: `translateX(${shift}px)` }}
                    className="animate-pop-in absolute top-full left-0 z-50 mt-1 flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-pop"
                >
                    <input
                        autoFocus
                        value={url}
                        placeholder="https://… или name@example.com"
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                apply();
                            }
                        }}
                        className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="h-8 rounded-md px-3 text-sm hover:bg-surface-2" onClick={() => setOpen(false)}>Отмена</button>
                        <button type="button" className="h-8 rounded-md bg-primary px-3 text-sm text-on-primary" onClick={apply}>
                            {url.trim() ? 'Применить' : 'Убрать ссылку'}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/** Выбор размера таблицы сеткой 8×8 и окно точных значений (без вложенной формы) */
function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState(false);
    const [hover, setHover] = useState({ r: 0, c: 0 });
    const [rows, setRows] = useState('3');
    const [cols, setCols] = useState('3');
    const box = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);

    const close = () => {
        setOpen(false);
        setCustom(false);
        setHover({ r: 0, c: 0 });
    };
    useDismiss(open, close, box);
    // Панель меняет размер в режиме «Настроить…», поэтому custom входит в зависимости
    const shift = usePanelShift(open, panel, [custom]);

    const pick = (r: number, c: number) => {
        close();
        onPick(r, c);
    };
    const submitCustom = () =>
        pick(Math.min(Math.max(Number(rows) || 1, 1), 20), Math.min(Math.max(Number(cols) || 1, 1), 10));
    const onEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitCustom();
        }
    };

    return (
        <div ref={box} className="relative">
            <Tool label="Вставить таблицу" active={open} onClick={() => setOpen((p) => !p)}>
                <TableIcon size={16} />
            </Tool>
            {open ? (
                <div
                    ref={panel}
                    style={{ transform: `translateX(${shift}px)` }}
                    className="animate-pop-in absolute top-full right-0 z-50 mt-1 w-max rounded-xl border border-border bg-surface p-3 shadow-pop"
                >
                    {custom ? (
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center justify-between gap-3 text-sm">
                                Строк (1–20)
                                <input inputMode="numeric" value={rows} onChange={(e) => setRows(e.target.value)} onKeyDown={onEnter} className="h-8 w-16 rounded-md border border-border bg-surface text-center" />
                            </label>
                            <label className="flex items-center justify-between gap-3 text-sm">
                                Столбцов (1–10)
                                <input inputMode="numeric" value={cols} onChange={(e) => setCols(e.target.value)} onKeyDown={onEnter} className="h-8 w-16 rounded-md border border-border bg-surface text-center" />
                            </label>
                            <div className="flex justify-end gap-2">
                                <button type="button" className="h-8 rounded-md px-3 text-sm hover:bg-surface-2" onClick={() => setCustom(false)}>Назад</button>
                                <button type="button" className="h-8 rounded-md bg-primary px-3 text-sm text-on-primary" onClick={submitCustom}>Вставить</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="tabular mb-2 text-center text-sm text-muted">{hover.r > 0 ? `${hover.r} × ${hover.c}` : 'Выберите размер'}</p>
                            <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID}, 1.25rem)` }} onMouseLeave={() => setHover({ r: 0, c: 0 })}>
                                {Array.from({ length: GRID * GRID }, (_, i) => {
                                    const r = Math.floor(i / GRID) + 1;
                                    const c = (i % GRID) + 1;
                                    const lit = r <= hover.r && c <= hover.c;
                                    return (
                                        <button
                                            key={i}
                                            type="button"
                                            aria-label={`${r} × ${c}`}
                                            className={`size-5 rounded-sm border ${lit ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
                                            onMouseEnter={() => setHover({ r, c })}
                                            onClick={() => pick(r, c)}
                                        />
                                    );
                                })}
                            </div>
                            <button type="button" className="mt-3 h-8 w-full rounded-md border border-border text-sm hover:bg-surface-2" onClick={() => setCustom(true)}>
                                Настроить…
                            </button>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
}

type Edge = 'left' | 'right' | 'top' | 'bottom' | null;
type TableOp = 'addColumnBefore' | 'addColumnAfter' | 'addRowBefore' | 'addRowAfter' | 'deleteColumn' | 'deleteRow' | 'deleteTable';

const OVERLAY_BTN =
    'absolute z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-fg shadow hover:bg-primary hover:text-on-primary';

/** Текущее выравнивание: по умолчанию слева */
function currentAlign(editor: Editor): 'left' | 'center' | 'right' {
    const attrs = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph');
    const value = attrs.textAlign as string | undefined;
    return value === 'center' || value === 'right' ? value : 'left';
}

/** Редактор: форматирование, цвет, выравнивание, отступы, индексы, ссылки, таблицы с управлением у границ */
export function RichEditor({ value, onChange, invalid }: Props) {
    const box = useRef<HTMLDivElement>(null);
    const area = useRef<HTMLDivElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const [hover, setHover] = useState<{ cell: HTMLElement; edge: Edge } | null>(null);

    const editor = useEditor({
        extensions: [
            // Заголовки второго и третьего уровня; ссылки в новой вкладке
            StarterKit.configure({
                heading: { levels: [2, 3] },
                link: { openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
            }),
            Subscript,
            Superscript,
            TextStyle,
            Color,
            Indent,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: value,
        onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
        editorProps: { attributes: { class: `${RICH_CLASS} px-8 py-5` } },
    });

    const cancelHide = () => window.clearTimeout(timer.current);
    const scheduleHide = () => {
        cancelHide();
        timer.current = window.setTimeout(() => setHover(null), HIDE_DELAY);
    };
    useEffect(() => cancelHide, []);

    useEffect(() => {
        if (!editor) return;
        const clear = () => setHover(null);
        editor.on('update', clear);
        return () => {
            editor.off('update', clear);
        };
    }, [editor]);

    if (!editor) return null;

    const onMove = (e: ReactMouseEvent) => {
        const target = e.target as HTMLElement;
        const cell = target.closest('td,th') as HTMLElement | null;
        if (cell && cell.closest('.ProseMirror')) {
            cancelHide();
            const r = cell.getBoundingClientRect();
            let edge: Edge = null;
            if (Math.abs(e.clientX - r.right) <= EDGE) edge = 'right';
            else if (Math.abs(e.clientX - r.left) <= EDGE) edge = 'left';
            else if (Math.abs(e.clientY - r.bottom) <= EDGE) edge = 'bottom';
            else if (Math.abs(e.clientY - r.top) <= EDGE) edge = 'top';
            setHover((prev) => {
                // Найденная граница запоминается, пока курсор остаётся в таблице
                const next = edge ?? (prev ? prev.edge : null);
                return prev && prev.cell === cell && prev.edge === next ? prev : { cell, edge: next };
            });
        } else if (hover) {
            scheduleHide();
        }
    };

    const run = (op: TableOp) => {
        if (!hover) return;
        try {
            const pos = editor.view.posAtDOM(hover.cell, 0);
            editor.chain().focus().setTextSelection(pos + 1)[op]().run();
        } finally {
            setHover(null);
        }
    };

    const insertTable = (rows: number, cols: number) =>
        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();

    /**
    * Отступ как в Word: в списке — вложенность пункта; если вложить нельзя
    * (первый пункт) — сдвиг пункта вместе с маркером; иначе красная строка
    * (или отступ справа при выравнивании вправо)
    */
    const indent = (delta: 1 | -1) => {
        if (editor.isActive('listItem')) {
            const chain = editor.chain().focus();
            const moved = delta === 1 ? chain.sinkListItem('listItem').run() : chain.liftListItem('listItem').run();
            if (moved) return;
            editor
                .chain()
                .focus()
                .command(({ tr, state }) => {
                    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
                        if (node.type.name === 'listItem') {
                            const level = Math.min(Math.max((Number(node.attrs.indent) || 0) + delta, 0), 8);
                            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
                        }
                    });
                    return true;
                })
                .run();
            return;
        }
        editor
            .chain()
            .focus()
            .command(({ tr, state }) => {
                state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
                    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                        const level = Math.min(Math.max((Number(node.attrs.indent) || 0) + delta, 0), 8);
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
                    }
                });
                return true;
            })
            .run();
    };

    const align = currentAlign(editor);

    // Положение кнопок управления таблицей относительно области набора
    const overlay = (() => {
        const container = area.current?.getBoundingClientRect();
        if (!hover || !container || !hover.cell.isConnected) return null;
        const cell = hover.cell.getBoundingClientRect();
        const table = (hover.cell.closest('table') as HTMLElement).getBoundingClientRect();
        return {
            colX: cell.left + cell.width / 2 - container.left,
            rowY: cell.top + cell.height / 2 - container.top,
            top: table.top - container.top - 16,
            left: table.left - container.left - 16,
            borderX: (hover.edge === 'left' ? cell.left : cell.right) - container.left,
            borderY: (hover.edge === 'top' ? cell.top : cell.bottom) - container.top,
        };
    })();

    const keep = { onMouseEnter: cancelHide, onMouseLeave: scheduleHide, onMouseDown: (e: ReactMouseEvent) => e.preventDefault() };

    const showAddRow = hover?.edge === 'top' || hover?.edge === 'bottom' || hover?.edge === 'left';
    const showAddCol = hover?.edge === 'left' || hover?.edge === 'right';

    return (
        <div
            ref={box}
            onMouseMove={onMove}
            onMouseLeave={scheduleHide}
            className={`rounded-lg border bg-surface transition-colors focus-within:border-primary ${invalid ? 'border-danger' : 'border-border'}`}
        >
            {/* Панель инструментов всегда выше кнопок таблицы; группы переносятся целиком */}
            <div className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-lg border-b border-border bg-surface px-3 py-2">
                <Group>
                    <Tool label="Отменить" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></Tool>
                    <Tool label="Повторить" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></Tool>
                </Group>
                <Group>
                    <Tool label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></Tool>
                    <Tool label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></Tool>
                    <Tool label="Подчёркнутый" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></Tool>
                </Group>
                <Group>
                    <Tool label="Нижний индекс" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}><SubIcon size={16} /></Tool>
                    <Tool label="Верхний индекс" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}><SupIcon size={16} /></Tool>
                </Group>
                <Group><ColorPicker editor={editor} /></Group>
                <Group>
                    <Tool label="Заголовок" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Tool>
                </Group>
                <Group><LinkTool editor={editor} /></Group>
                <Group>
                    <Tool label="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></Tool>
                    <Tool label="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Tool>
                </Group>
                <Group>
                    <Tool label="Увеличить красную строку" onClick={() => indent(1)}><IndentIncrease size={16} /></Tool>
                    <Tool label="Уменьшить красную строку" onClick={() => indent(-1)}><IndentDecrease size={16} /></Tool>
                </Group>
                <Group>
                    <Tool label="По левому краю" active={align === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={16} /></Tool>
                    <Tool label="По центру" active={align === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={16} /></Tool>
                    <Tool label="По правому краю" active={align === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={16} /></Tool>
                </Group>
                <Group>
                    <Tool label="Прикрепить файл (скоро)" disabled onClick={() => undefined}><Paperclip size={16} /></Tool>
                </Group>
                <Group><TablePicker onPick={insertTable} /></Group>
            </div>

            {/* Область набора: высота меняется ручкой снизу справа; кнопки таблицы обрезаются по её границам */}
            <div ref={area} className="relative overflow-hidden rounded-b-lg">
                <div className="h-56 min-h-32 resize-y overflow-x-hidden overflow-y-auto" onScroll={() => setHover(null)}>
                    <EditorContent editor={editor} className="h-full" />
                </div>

                {overlay && hover ? (
                    <>
                        <button type="button" aria-label="Удалить таблицу" title="Удалить таблицу" className={`${OVERLAY_BTN} text-danger`} style={{ left: overlay.left, top: overlay.top }} {...keep} onClick={() => run('deleteTable')}>
                            <Trash2 size={14} />
                        </button>
                        <button type="button" aria-label="Удалить столбец" title="Удалить столбец" className={OVERLAY_BTN} style={{ left: overlay.colX, top: overlay.top }} {...keep} onClick={() => run('deleteColumn')}>
                            <Minus size={14} />
                        </button>
                        <button type="button" aria-label="Удалить строку" title="Удалить строку" className={OVERLAY_BTN} style={{ left: overlay.left, top: overlay.rowY }} {...keep} onClick={() => run('deleteRow')}>
                            <Minus size={14} />
                        </button>
                        {showAddCol ? (
                            <button type="button" aria-label="Добавить столбец" title="Добавить столбец" className={OVERLAY_BTN} style={{ left: overlay.borderX, top: overlay.top }} {...keep} onClick={() => run(hover.edge === 'left' ? 'addColumnBefore' : 'addColumnAfter')}>
                                <Plus size={14} />
                            </button>
                        ) : null}
                        {showAddRow ? (
                            <button type="button" aria-label="Добавить строку" title="Добавить строку" className={OVERLAY_BTN} style={{ left: overlay.left, top: overlay.borderY }} {...keep} onClick={() => run(hover.edge === 'top' ? 'addRowBefore' : 'addRowAfter')}>
                                <Plus size={14} />
                            </button>
                        ) : null}
                    </>
                ) : null}
            </div>
        </div>
    );
}