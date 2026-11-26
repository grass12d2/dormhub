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
    Check,
    Heading2,
    IndentDecrease,
    IndentIncrease,
    Italic,
    Link2,
    Link2Off,
    List,
    ListOrdered,
    Palette,
    Paperclip,
    Redo2,
    Subscript as SubIcon,
    Superscript as SupIcon,
    Table as TableIcon,
    Underline as UnderlineIcon,
    Undo2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { toHex } from '../../lib/colors';
import { Indent } from '../../lib/indentExtension';
import { ACCENTS, ACCENT_LABELS, ACCENT_SWATCH } from '../../theme/theme';
import { RICH_CLASS } from './RichText';
import { TableOverlay } from './TableOverlay';

interface Props {
    /** Начальный HTML (при редактировании) */
    value: string;
    onChange: (html: string) => void;
    invalid?: boolean;
    /** Нажатие на скрепку: страница открывает выбор файлов */
    onAttach?: () => void;
}

const GRID = 8;
const tool = (active: boolean) =>
    `flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${active ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2'
    }`;

export function Tool({
    label,
    active = false,
    disabled,
    onClick,
    children,
}: {
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
export const Group = ({ children }: { children: ReactNode }) => (
    <div className="flex shrink-0 items-center gap-1">{children}</div>
);

/** Закрытие всплывающей панели по щелчку снаружи и по Esc (клики внутри плавающих панелей игнорируются) */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!open) return;
        const down = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-floating]')) return;
            if (ref.current && !ref.current.contains(target)) close();
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

/** Панель у кнопки: выносится в body и позиционируется по экрану, поэтому не обрезается прокруткой */
export function Floating({
    anchor,
    up = false,
    dep,
    children,
}: {
    anchor: RefObject<HTMLElement | null>;
    up?: boolean;
    dep?: unknown;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
    useLayoutEffect(() => {
        const a = anchor.current;
        const p = ref.current;
        if (!a || !p) return;
        const r = a.getBoundingClientRect();
        const margin = 8;
        const left = Math.max(
            margin,
            Math.min(r.left + r.width / 2 - p.offsetWidth / 2, window.innerWidth - p.offsetWidth - margin)
        );
        setPos(up ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
    }, [anchor, up, dep]);
    return createPortal(
        <div
            ref={ref}
            data-floating
            style={{ position: 'fixed', ...pos, visibility: pos ? 'visible' : 'hidden' }}
            className="animate-pop-in z-[80] w-max max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-3 shadow-pop"
        >
            {children}
        </div>,
        document.body
    );
}

/** Выбор цвета текста из десяти цветов темы */
export function ColorPicker({ editor, up = false }: { editor: Editor; up?: boolean }) {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useDismiss(open, () => setOpen(false), box);
    const current = (editor.getAttributes('textStyle').color as string | undefined) ?? null;

    return (
        <div ref={box} className="relative">
            <Tool label="Цвет текста" active={open || current !== null} onClick={() => setOpen((p) => !p)}>
                <Palette size={16} />
            </Tool>
            {open ? (
                <Floating anchor={box} up={up}>
                    <div className="grid grid-cols-5 gap-2">
                        {ACCENTS.map((accent) => (
                            <button
                                key={accent}
                                type="button"
                                aria-label={ACCENT_LABELS[accent]}
                                title={ACCENT_LABELS[accent]}
                                style={{ backgroundColor: ACCENT_SWATCH[accent] }}
                                className={`size-6 rounded-full ring-offset-2 ring-offset-surface ${current === toHex(ACCENT_SWATCH[accent]) ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border'
                                    }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    editor.chain().focus().setColor(toHex(ACCENT_SWATCH[accent])).run();
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
                </Floating>
            ) : null}
        </div>
    );
}

/** Ссылка: ввод адреса (http, https или mailto); пустой адрес снимает ссылку */
export function LinkTool({ editor }: { editor: Editor }) {
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
        const href =
            value && !/^(https?:|mailto:)/i.test(value) ? (value.includes('@') ? `mailto:${value}` : `https://${value}`) : value;
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
                        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-surface-2" onClick={() => setOpen(false)}>
                            <X size={14} aria-hidden="true" />
                            Отмена
                        </button>
                        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm text-on-primary" onClick={apply}>
                            {url.trim() ? <Check size={14} aria-hidden="true" /> : <Link2Off size={14} aria-hidden="true" />}
                            {url.trim() ? 'Применить' : 'Убрать ссылку'}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/** Выбор размера таблицы сеткой 8×8 и окно точных значений (без вложенной формы) */
export function TablePicker({ onPick, up = false }: { onPick: (rows: number, cols: number) => void; up?: boolean }) {
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState(false);
    const [hover, setHover] = useState({ r: 0, c: 0 });
    const [rows, setRows] = useState('3');
    const [cols, setCols] = useState('3');
    const box = useRef<HTMLDivElement>(null);

    const close = () => {
        setOpen(false);
        setCustom(false);
        setHover({ r: 0, c: 0 });
    };
    useDismiss(open, close, box);

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
                <Floating anchor={box} up={up} dep={custom}>
                    {custom ? (
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center justify-between gap-3 text-sm">
                                Строк (1–20)
                                <input
                                    inputMode="numeric"
                                    value={rows}
                                    onChange={(e) => setRows(e.target.value)}
                                    onKeyDown={onEnter}
                                    className="h-8 w-16 rounded-md border border-border bg-surface text-center"
                                />
                            </label>
                            <label className="flex items-center justify-between gap-3 text-sm">
                                Столбцов (1–10)
                                <input
                                    inputMode="numeric"
                                    value={cols}
                                    onChange={(e) => setCols(e.target.value)}
                                    onKeyDown={onEnter}
                                    className="h-8 w-16 rounded-md border border-border bg-surface text-center"
                                />
                            </label>
                            <div className="flex justify-end gap-2">
                                <button type="button" className="h-8 rounded-md px-3 text-sm hover:bg-surface-2" onClick={() => setCustom(false)}>
                                    Назад
                                </button>
                                <button type="button" className="h-8 rounded-md bg-primary px-3 text-sm text-on-primary" onClick={submitCustom}>
                                    Вставить
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="tabular mb-2 text-center text-sm text-muted">
                                {hover.r > 0 ? `${hover.r} × ${hover.c}` : 'Выберите размер'}
                            </p>
                            <div
                                className="grid gap-0.5"
                                style={{ gridTemplateColumns: `repeat(${GRID}, 1.25rem)` }}
                                onMouseLeave={() => setHover({ r: 0, c: 0 })}
                            >
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
                            <button
                                type="button"
                                className="mt-3 h-8 w-full rounded-md border border-border text-sm hover:bg-surface-2"
                                onClick={() => setCustom(true)}
                            >
                                Настроить…
                            </button>
                        </>
                    )}
                </Floating>
            ) : null}
        </div>
    );
}

/** Текущее выравнивание: по умолчанию слева */
function currentAlign(editor: Editor): 'left' | 'center' | 'right' {
    const attrs = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph');
    const value = attrs.textAlign as string | undefined;
    return value === 'center' || value === 'right' ? value : 'left';
}

/** Редактор: форматирование, цвет, выравнивание, отступы, индексы, ссылки, таблицы с управлением у границ */
export function RichEditor({ value, onChange, invalid, onAttach }: Props) {
    const area = useRef<HTMLDivElement>(null);

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

    if (!editor) return null;

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

    return (
        <div
            className={`rounded-lg border bg-surface transition-colors focus-within:border-primary ${invalid ? 'border-danger' : 'border-border'
                }`}
        >
            {/* Панель инструментов всегда выше кнопок таблицы; группы переносятся целиком */}
            <div className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-lg border-b border-border bg-surface px-3 py-2">
                <Group>
                    <Tool label="Отменить" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
                        <Undo2 size={16} />
                    </Tool>
                    <Tool label="Повторить" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
                        <Redo2 size={16} />
                    </Tool>
                </Group>
                <Group>
                    <Tool label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
                        <Bold size={16} />
                    </Tool>
                    <Tool label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
                        <Italic size={16} />
                    </Tool>
                    <Tool label="Подчёркнутый" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                        <UnderlineIcon size={16} />
                    </Tool>
                </Group>
                <Group>
                    <Tool label="Нижний индекс" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
                        <SubIcon size={16} />
                    </Tool>
                    <Tool label="Верхний индекс" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
                        <SupIcon size={16} />
                    </Tool>
                </Group>
                <Group>
                    <ColorPicker editor={editor} />
                </Group>
                <Group>
                    <Tool label="Заголовок" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                        <Heading2 size={16} />
                    </Tool>
                </Group>
                <Group>
                    <LinkTool editor={editor} />
                </Group>
                <Group>
                    <Tool label="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                        <List size={16} />
                    </Tool>
                    <Tool label="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                        <ListOrdered size={16} />
                    </Tool>
                </Group>
                <Group>
                    <Tool label="Увеличить красную строку" onClick={() => indent(1)}>
                        <IndentIncrease size={16} />
                    </Tool>
                    <Tool label="Уменьшить красную строку" onClick={() => indent(-1)}>
                        <IndentDecrease size={16} />
                    </Tool>
                </Group>
                <Group>
                    <Tool label="По левому краю" active={align === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
                        <AlignLeft size={16} />
                    </Tool>
                    <Tool label="По центру" active={align === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
                        <AlignCenter size={16} />
                    </Tool>
                    <Tool label="По правому краю" active={align === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
                        <AlignRight size={16} />
                    </Tool>
                </Group>
                <Group>
                    <Tool label="Прикрепить файл" disabled={!onAttach} onClick={() => onAttach?.()}>
                        <Paperclip size={16} />
                    </Tool>
                </Group>
                <Group>
                    <TablePicker onPick={insertTable} />
                </Group>
            </div>

            {/* Область набора: высота меняется ручкой снизу справа; кнопки таблицы обрезаются по её границам */}
            <div ref={area} className="relative overflow-hidden rounded-b-lg">
                <div className="h-56 min-h-32 resize-y overflow-x-hidden overflow-y-auto">
                    <EditorContent editor={editor} className="h-full" />
                </div>
                <TableOverlay editor={editor} host={area} />
            </div>
        </div>
    );
}