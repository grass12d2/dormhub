import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    Bold,
    Check,
    Heading2,
    Italic,
    List,
    ListOrdered,
    Maximize2,
    Minimize2,
    Paperclip,
    Pencil,
    Redo2,
    SendHorizontal,
    Subscript as SubIcon,
    Superscript as SupIcon,
    Underline as UnderlineIcon,
    Undo2,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ACCEPT, MAX_FILES, formatSize, validateFile } from '../../lib/files';
import { HScrollbar } from '../ui/HScrollbar';
import { ColorPicker, TablePicker, Tool } from '../ui/RichEditor';
import { TableOverlay } from '../ui/TableOverlay';

/** Лимит вложения чата, байт */
const MAX_CHAT_BYTES = 10 * 1024 * 1024;
/** Длительность и кривая анимации расширения/сужения поля */
const ANIM_MS = 260;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const BTN = 'flex size-9 shrink-0 items-center justify-center rounded-md transition-colors';

interface Props {
    /** Отправка: html, простой текст и файлы; true — сообщение отправлено, поле очищается */
    onSend: (html: string, text: string, files: File[]) => Promise<boolean>;
    sending: boolean;
    /** Сообщение, на которое отвечаем (null — обычное сообщение) */
    replyTo?: { id: number; senderName: string; text: string | null } | null;
    onCancelReply?: () => void;
    /** Редактируемое сообщение: его текст подставляется в поле, отправка сохраняет правку */
    editing?: { id: number; html: string | null; text: string } | null;
    onCancelEdit?: () => void;
}

/** Простой текст в HTML для редактора: спецсимволы экранируются, строки — абзацы */
const textToHtml = (text: string): string =>
    text
        .split('\n')
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('');

/** Поле ввода чата: до 4 строк; по кнопке — расширенный режим (30% высоты) с панелью форматирования внизу */
export function ChatComposer({ onSend, sending, replyTo, onCancelReply, editing, onCancelEdit }: Props) {
    const [, force] = useState(0);
    const [files, setFiles] = useState<File[]>([]);
    const [fileError, setFileError] = useState('');
    const [expanded, setExpanded] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const area = useRef<HTMLDivElement>(null);
    const host = useRef<HTMLDivElement>(null);
    const tools = useRef<HTMLDivElement>(null);
    const timers = useRef<number[]>([]);
    // Обработчик клавиш редактора создаётся один раз: актуальная отмена правки берётся из ref
    const cancelEdit = useRef<(() => void) | null>(null);
    cancelEdit.current = editing && onCancelEdit ? onCancelEdit : null;

    useEffect(() => {
        const pending = timers.current;
        return () => pending.forEach(window.clearTimeout);
    }, []);

    const editor = useEditor({
        extensions: [
            // Заголовок второго уровня; ссылки определяются автоматически и открываются в новой вкладке
            StarterKit.configure({
                heading: { levels: [2] },
                link: {
                    openOnClick: false,
                    autolink: true,
                    HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
                },
            }),
            Subscript,
            Superscript,
            TextStyle,
            Color,
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: '',
        onTransaction: () => force((n) => n + 1),
        // Enter только переносит строку: отправка выполняется кнопкой
        editorProps: {
            // Escape во время правки отменяет её
            handleKeyDown: (_view, event) => {
                if (event.key !== 'Escape' || !cancelEdit.current) return false;
                cancelEdit.current();
                return true;
            },
            attributes: {
                class: 'chat-editor chat-text px-2 py-1.5 text-[0.9375rem] leading-snug outline-none',
            },
        },
    });

    // Начало правки — текст сообщения в поле, курсор в конце; отмена — поле очищается
    const editingId = editing?.id ?? null;
    const editingRef = useRef(editing);
    editingRef.current = editing;
    const wasEditing = useRef(false);
    useEffect(() => {
        if (!editor) return;
        const current = editingRef.current;
        if (current) {
            editor.commands.setContent(current.html ?? textToHtml(current.text), { emitUpdate: true });
            editor.commands.focus('end');
            wasEditing.current = true;
        } else if (wasEditing.current) {
            editor.commands.clearContent(true);
            wasEditing.current = false;
        }
    }, [editor, editingId]);

    const empty = !editor || editor.isEmpty;
    // Пусто только если нет текста и нет таблицы или списка
    const reallyEmpty = !editor || (editor.isEmpty && !editor.view.dom.querySelector('table, ul, ol'));
    // Правка не может оставить сообщение пустым; вложения при правке не меняются
    const canSend = !sending && (editing ? !empty : !empty || files.length > 0);

    const send = async () => {
        if (!editor || !canSend) return;
        const html = editor.isEmpty ? '' : editor.getHTML();
        const ok = await onSend(html, editor.getText().trim(), files);
        if (ok) {
            wasEditing.current = false;
            editor.commands.clearContent(true);
            setFiles([]);
            setFileError('');
            if (expanded) collapse();
        }
    };

    const clearTimers = () => {
        timers.current.forEach(window.clearTimeout);
        timers.current = [];
    };

    /**
     * Высота поля анимируется напрямую через style (без перерисовок React на каждом шаге):
     * фиксируется текущая высота, затем после принудительного расчёта раскладки задаётся конечная
     */
    const animateHeight = (to: string) => {
        const el = area.current;
        if (!el) return;
        el.style.transition = 'none';
        el.style.maxHeight = 'none';
        el.style.height = `${el.offsetHeight}px`;
        void el.offsetHeight;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.style.transition = reduce ? 'none' : `height ${ANIM_MS}ms ${EASE}`;
        el.style.height = to;
    };

    /** Плавное расширение: от текущей высоты до 30vh */
    const expand = () => {
        clearTimers();
        animateHeight('30vh');
        setExpanded(true);
    };

    /** Плавное сужение до высоты содержимого (не более четырёх строк), затем высота снова по содержимому */
    const collapse = () => {
        clearTimers();
        const content = (editor?.view.dom as HTMLElement | undefined)?.scrollHeight ?? 0;
        animateHeight(`${Math.min(Math.max(content, 36), 96)}px`);
        setExpanded(false);
        timers.current.push(
            window.setTimeout(() => {
                const el = area.current;
                if (!el) return;
                el.style.transition = '';
                el.style.height = '';
                el.style.maxHeight = '';
            }, ANIM_MS),
        );
    };

    const pick = (list: FileList | null) => {
        if (!list) return;
        const next = [...files];
        for (const file of Array.from(list)) {
            const problem = validateFile(file, MAX_CHAT_BYTES);
            if (problem) {
                setFileError(problem);
                return;
            }
            if (next.length >= MAX_FILES) {
                setFileError(`Не более ${MAX_FILES} файлов`);
                return;
            }
            next.push(file);
        }
        setFileError('');
        setFiles(next);
        if (fileInput.current) fileInput.current.value = '';
    };

    if (!editor) return null;

    const attach = (
        <button
            type="button"
            aria-label="Прикрепить файл"
            title={editing ? 'Вложения при правке не меняются' : 'Прикрепить файл'}
            disabled={Boolean(editing)}
            className={`${BTN} text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent`}
            onClick={() => fileInput.current?.click()}
        >
            <Paperclip size={18} aria-hidden="true" />
        </button>
    );
    // Кнопка размера всегда слева от кнопки отправки
    const toggle = (
        <button
            type="button"
            aria-label={expanded ? 'Свернуть' : 'Развернуть'}
            title={expanded ? 'Свернуть' : 'Развернуть'}
            className={`${BTN} text-muted hover:bg-surface-2 hover:text-fg`}
            onClick={expanded ? collapse : expand}
        >
            {expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </button>
    );
    const sendBtn = (
        <button
            type="button"
            aria-label={editing ? 'Сохранить' : 'Отправить'}
            title={editing ? 'Сохранить' : 'Отправить'}
            disabled={!canSend}
            onClick={() => void send()}
            className={`${BTN} text-primary hover:bg-primary-soft disabled:opacity-40 disabled:hover:bg-transparent`}
        >
            {editing ? <Check size={20} aria-hidden="true" /> : <SendHorizontal size={20} aria-hidden="true" />}
        </button>
    );
    // Внешний блок не прокручивается: в нём, как в «Объявлениях», размещаются кнопки «+», «−» и удаления таблицы
    const areaBox = (
        <div ref={host} className="relative min-w-0 flex-1 overflow-hidden">
            {/* Высоту в развёрнутом режиме и во время анимации задают expand/collapse через style */}
            <div ref={area} className="max-h-24 overflow-y-auto">
                <div className="relative min-h-full">
                    {reallyEmpty ? (
                        <span className="pointer-events-none absolute top-1.5 left-2 text-[0.9375rem] text-muted">Сообщение</span>
                    ) : null}
                    <EditorContent editor={editor} className="min-h-full" />
                </div>
            </div>
            <TableOverlay editor={editor} host={host} />
        </div>
    );

    return (
        <div className="flex flex-col gap-2">
            {editing ? (
                <div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-surface-2 px-3 py-1 text-sm">
                    <Pencil size={14} aria-hidden="true" className="shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-primary">Редактирование</span>
                        <span className="block truncate text-muted">{editing.text}</span>
                    </div>
                    <button type="button" aria-label="Отменить правку" title="Отменить (Esc)" className="rounded p-1 hover:bg-surface" onClick={onCancelEdit}>
                        <X size={14} aria-hidden="true" />
                    </button>
                </div>
            ) : replyTo ? (
                <div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-surface-2 px-3 py-1 text-sm">
                    <div className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-primary">{replyTo.senderName}</span>
                        <span className="block truncate text-muted">{replyTo.text ?? 'Сообщение'}</span>
                    </div>
                    <button type="button" aria-label="Отменить ответ" className="rounded p-1 hover:bg-surface" onClick={onCancelReply}>
                        <X size={14} aria-hidden="true" />
                    </button>
                </div>
            ) : null}

            {files.length > 0 || fileError ? (
                <div className="flex flex-col gap-1">
                    {files.map((f, i) => (
                        <div
                            key={`${f.name}-${i}`}
                            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1 text-sm"
                        >
                            <Paperclip size={14} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            <span className="tabular text-xs text-muted">{formatSize(f.size)}</span>
                            <button
                                type="button"
                                aria-label="Убрать файл"
                                className="rounded p-1 hover:bg-surface-2"
                                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                            >
                                <X size={14} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                    {fileError ? <p className="text-sm text-danger">{fileError}</p> : null}
                </div>
            ) : null}

            {/*
              Одно дерево для обоих режимов: редактор не пересоздаётся. В свёрнутом виде кнопки стоят по бокам поля,
              в развёрнутом боковые кнопки плавно сужаются, а снизу раскрывается строка с инструментами
            */}
            <div className="rounded-lg border border-border bg-surface focus-within:border-primary">
                <div className="flex items-end p-1.5">
                    <Side open={!expanded} align="left">
                        {attach}
                    </Side>
                    {areaBox}
                    <Side open={!expanded} align="right">
                        {toggle}
                        {sendBtn}
                    </Side>
                </div>
                <div
                    className="grid motion-safe:transition-[grid-template-rows,opacity]"
                    style={{
                        gridTemplateRows: expanded ? '1fr' : '0fr',
                        opacity: expanded ? 1 : 0,
                        transitionDuration: `${ANIM_MS}ms`,
                        transitionTimingFunction: EASE,
                    }}
                    inert={!expanded}
                >
                    <div className="min-h-0 overflow-hidden">
                        {/* Нижняя строка: вложение | инструменты по центру (тонкая полоса прокрутки под ними) | свернуть | отправить */}
                        <div className="mx-1.5 flex items-center gap-1 border-t border-border pt-1 pb-2">
                            {attach}
                            <div className="relative min-w-0 flex-1">
                                <div
                                    ref={tools}
                                    className="scroll-ghost overflow-x-auto"
                                    onWheel={(e) => {
                                        if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
                                    }}
                                >
                                    <div className="mx-auto flex w-max items-center gap-1 px-1">
                                    <Tool
                                    label="Жирный"
                                    active={editor.isActive('bold')}
                                    onClick={() => editor.chain().focus().toggleBold().run()}
                                >
                                    <Bold size={16} />
                                </Tool>
                                <Tool
                                    label="Курсив"
                                    active={editor.isActive('italic')}
                                    onClick={() => editor.chain().focus().toggleItalic().run()}
                                >
                                    <Italic size={16} />
                                </Tool>
                                <Tool
                                    label="Подчёркнутый"
                                    active={editor.isActive('underline')}
                                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                                >
                                    <UnderlineIcon size={16} />
                                </Tool>
                                <Tool
                                    label="Нижний индекс"
                                    active={editor.isActive('subscript')}
                                    onClick={() => editor.chain().focus().toggleSubscript().run()}
                                >
                                    <SubIcon size={16} />
                                </Tool>
                                <Tool
                                    label="Верхний индекс"
                                    active={editor.isActive('superscript')}
                                    onClick={() => editor.chain().focus().toggleSuperscript().run()}
                                >
                                    <SupIcon size={16} />
                                </Tool>
                                <ColorPicker editor={editor} up />
                                <Tool
                                    label="Заголовок"
                                    active={editor.isActive('heading', { level: 2 })}
                                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                                >
                                    <Heading2 size={16} />
                                </Tool>
                                <Tool
                                    label="Маркированный список"
                                    active={editor.isActive('bulletList')}
                                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                                >
                                    <List size={16} />
                                </Tool>
                                <Tool
                                    label="Нумерованный список"
                                    active={editor.isActive('orderedList')}
                                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                                >
                                    <ListOrdered size={16} />
                                </Tool>
                                <TablePicker
                                    up
                                    onPick={(rows, cols) =>
                                        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                                    }
                                />
                                <Tool
                                    label="Отменить"
                                    disabled={!editor.can().undo()}
                                    onClick={() => editor.chain().focus().undo().run()}
                                >
                                    <Undo2 size={16} />
                                </Tool>
                                <Tool
                                    label="Повторить"
                                    disabled={!editor.can().redo()}
                                    onClick={() => editor.chain().focus().redo().run()}
                                >
                                    <Redo2 size={16} />
                                </Tool>
                                    </div>
                                </div>
                                {/* Полоса под значками, в нижнем отступе строки: значки не перекрывает и выравнивание не сдвигает */}
                                <HScrollbar target={tools} className="absolute inset-x-1 top-full mt-px" />
                            </div>
                            {toggle}
                            {sendBtn}
                        </div>
                    </div>
                </div>
            </div>

            <input
                ref={fileInput}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                aria-label="Выбрать файлы"
                onChange={(e) => pick(e.target.files)}
            />
        </div>
    );
}

/** Боковая группа кнопок свёрнутого режима: плавно сужается до нуля при развёртывании */
function Side({ open, align, children }: { open: boolean; align: 'left' | 'right'; children: ReactNode }) {
    return (
        <div
            className="grid motion-safe:transition-[grid-template-columns,opacity]"
            style={{
                gridTemplateColumns: open ? '1fr' : '0fr',
                opacity: open ? 1 : 0,
                transitionDuration: `${ANIM_MS}ms`,
                transitionTimingFunction: EASE,
            }}
            inert={!open}
        >
            <div className={`flex min-w-0 overflow-hidden ${align === 'left' ? 'pr-1' : 'gap-1 pl-1'}`}>{children}</div>
        </div>
    );
}
