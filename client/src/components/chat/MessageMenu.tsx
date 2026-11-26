import { Copy, CornerUpLeft, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { REACTIONS, type ReactionKind } from '../../api/chat';

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

/** Ширина меню с шестью реакциями в одну строку, px: если экран уже — реакции в две строки по три */
const ONE_ROW_WIDTH = 300;

const ITEM = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2';

/** Контекстное меню сообщения (правая кнопка мыши / долгое нажатие): реакции, копирование, ответ, правка, удаление */
export function MessageMenu({
  x,
  y,
  mine,
  current,
  onReact,
  onCopy,
  onReply,
  onEdit,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  /** Показывать ли «Удалить» (свои сообщения; администратору — любые) */
  mine: boolean;
  current: ReactionKind | null;
  onReact: (kind: ReactionKind | null) => void;
  onCopy: () => void;
  onReply: () => void;
  /** «Изменить» — только для своих сообщений с текстом */
  onEdit?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Ширина меню подстраивается под строку реакций: одна строка из шести, на узком экране — две по три
  const [oneRow] = useState(() => window.innerWidth - 16 >= ONE_ROW_WIDTH);
  // До измерения меню скрыто: первая отрисовка сразу в правильном месте, без скачка
  const [pos, setPos] = useState<{ left: number; top: number; transformOrigin: string } | null>(null);

  // Меню остаётся внутри экрана; у нижнего края открывается над курсором и «вырастает» из точки щелчка
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    const top = y + h + 8 > window.innerHeight ? Math.max(8, y - h) : y;
    const ox = Math.min(w, Math.max(0, x - left));
    const oy = Math.min(h, Math.max(0, y - top));
    setPos({ left, top, transformOrigin: `${ox}px ${oy}px` });
  }, [x, y]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className={`${pos ? 'animate-menu-in' : 'invisible'} fixed z-[90] w-max max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-1 shadow-pop`}
      style={pos ?? { left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Шесть реакций в одну строку; на узком экране — две строки по три */}
      <div className={`grid ${oneRow ? 'grid-cols-6' : 'grid-cols-3'} justify-items-center gap-1 border-b border-border p-1 pb-2`}>
        {REACTIONS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-label={kind}
            className={`chat-text rounded-md px-1.5 py-0.5 text-xl hover:bg-surface-2 ${current === kind ? 'bg-primary-soft' : ''}`}
            onClick={() => {
              onReact(current === kind ? null : kind);
              onClose();
            }}
          >
            {REACTION_EMOJI[kind]}
          </button>
        ))}
      </div>
      <button type="button" className={ITEM} onClick={() => { onCopy(); onClose(); }}>
        <Copy size={16} aria-hidden="true" /> Копировать
      </button>
      <button type="button" className={ITEM} onClick={() => { onReply(); onClose(); }}>
        <CornerUpLeft size={16} aria-hidden="true" /> Ответить
      </button>
      {onEdit ? (
        <button type="button" className={ITEM} onClick={() => { onEdit(); onClose(); }}>
          <Pencil size={16} aria-hidden="true" /> Изменить
        </button>
      ) : null}
      {mine ? (
        <button type="button" className={`${ITEM} text-danger`} onClick={() => { onDelete(); onClose(); }}>
          <Trash2 size={16} aria-hidden="true" /> Удалить
        </button>
      ) : null}
    </div>
  );
}