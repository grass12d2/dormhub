import type { Editor } from '@tiptap/react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type Edge = 'left' | 'right' | 'top' | 'bottom' | null;
type TableOp =
    | 'addColumnBefore'
    | 'addColumnAfter'
    | 'addRowBefore'
    | 'addRowAfter'
    | 'deleteColumn'
    | 'deleteRow'
    | 'deleteTable';

/** Расстояние до границы ячейки (px), при котором появляется «+» */
const EDGE = 10;
/** Задержка скрытия кнопок таблицы, мс: хватает, чтобы довести курсор до кнопки */
const HIDE_DELAY = 600;

/** Кнопки выносятся в body поверх всего (выше окна Modal), поэтому не обрезаются краями поля ввода */
const OVERLAY_BTN =
    'fixed z-[60] flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-fg shadow hover:bg-primary hover:text-on-primary';

/**
 * Кнопки управления таблицей у границ ячейки под курсором: «−» столбца и строки,
 * «+» у ближайшей границы, удаление таблицы в правом нижнем углу. `host` — область
 * с редактором: в ней отслеживается курсор; сами кнопки рисуются поверх страницы.
 */
export function TableOverlay({ editor, host }: { editor: Editor; host: RefObject<HTMLElement | null> }) {
    const [hover, setHover] = useState<{ cell: HTMLElement; edge: Edge } | null>(null);
    const timer = useRef<number | undefined>(undefined);

    const cancelHide = useCallback(() => {
        window.clearTimeout(timer.current);
        timer.current = undefined;
    }, []);
    // Таймер не перезапускается при каждом движении мыши, иначе кнопки не скрылись бы, пока курсор движется
    const scheduleHide = useCallback(() => {
        if (timer.current !== undefined) return;
        timer.current = window.setTimeout(() => {
            timer.current = undefined;
            setHover(null);
        }, HIDE_DELAY);
    }, []);

    useEffect(() => {
        const el = host.current;
        if (!el) return;
        const move = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Курсор на самих кнопках: они остаются видимыми
            if (target.closest('[data-table-ctl]')) return;
            const cell = target.closest('td,th') as HTMLElement | null;
            if (!cell || !cell.closest('.ProseMirror')) {
                scheduleHide();
                return;
            }
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
        };
        const hide = () => setHover(null);
        el.addEventListener('mousemove', move);
        el.addEventListener('mouseleave', scheduleHide);
        // Любая прокрутка (поля или страницы) и смена размера окна смещают таблицу: кнопки скрываются
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        editor.on('update', hide);
        return () => {
            el.removeEventListener('mousemove', move);
            el.removeEventListener('mouseleave', scheduleHide);
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
            editor.off('update', hide);
            cancelHide();
        };
    }, [editor, host, cancelHide, scheduleHide]);

    const container = host.current?.getBoundingClientRect();
    if (!hover || !container || !hover.cell.isConnected) return null;
    const table = hover.cell.closest('table');
    if (!table) return null;

    const cell = hover.cell.getBoundingClientRect();
    // Ячейка прокручена за пределы поля ввода: кнопки не показываются
    if (cell.bottom < container.top || cell.top > container.bottom) return null;
    const t = table.getBoundingClientRect();
    // Координаты экрана (кнопки position: fixed)
    const pos = {
        colX: cell.left + cell.width / 2,
        rowY: cell.top + cell.height / 2,
        top: t.top - 16,
        left: t.left - 16,
        right: t.right + 16,
        bottom: t.bottom + 16,
        borderX: hover.edge === 'left' ? cell.left : cell.right,
        borderY: hover.edge === 'top' ? cell.top : cell.bottom,
    };

    const run = (op: TableOp) => {
        try {
            const at = editor.view.posAtDOM(hover.cell, 0);
            editor.chain().focus().setTextSelection(at + 1)[op]().run();
        } finally {
            cancelHide();
            setHover(null);
        }
    };

    const keep = {
        'data-table-ctl': true,
        onMouseEnter: cancelHide,
        // Кнопки вне области: уход с кнопки тоже запускает скрытие
        onMouseLeave: scheduleHide,
        onMouseDown: (e: ReactMouseEvent) => e.preventDefault(),
    };
    const showAddRow = hover.edge === 'top' || hover.edge === 'bottom' || hover.edge === 'left';
    const showAddCol = hover.edge === 'left' || hover.edge === 'right';

    return createPortal(
        <>
            <button type="button" aria-label="Удалить таблицу" title="Удалить таблицу" className={`${OVERLAY_BTN} text-danger`} style={{ left: pos.right, top: pos.bottom }} {...keep} onClick={() => run('deleteTable')}>
                <Trash2 size={14} />
            </button>
            <button type="button" aria-label="Удалить столбец" title="Удалить столбец" className={OVERLAY_BTN} style={{ left: pos.colX, top: pos.top }} {...keep} onClick={() => run('deleteColumn')}>
                <Minus size={14} />
            </button>
            <button type="button" aria-label="Удалить строку" title="Удалить строку" className={OVERLAY_BTN} style={{ left: pos.left, top: pos.rowY }} {...keep} onClick={() => run('deleteRow')}>
                <Minus size={14} />
            </button>
            {showAddCol ? (
                <button type="button" aria-label="Добавить столбец" title="Добавить столбец" className={OVERLAY_BTN} style={{ left: pos.borderX, top: pos.top }} {...keep} onClick={() => run(hover.edge === 'left' ? 'addColumnBefore' : 'addColumnAfter')}>
                    <Plus size={14} />
                </button>
            ) : null}
            {showAddRow ? (
                <button type="button" aria-label="Добавить строку" title="Добавить строку" className={OVERLAY_BTN} style={{ left: pos.left, top: pos.borderY }} {...keep} onClick={() => run(hover.edge === 'top' ? 'addRowBefore' : 'addRowAfter')}>
                    <Plus size={14} />
                </button>
            ) : null}
        </>,
        document.body
    );
}
