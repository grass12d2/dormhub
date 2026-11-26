import { Ban, BellOff, Bell, ChevronLeft, MoreVertical, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const HOUR = 3_600_000;
const MUTE_OPTIONS: Array<{ label: string; ms: number | null }> = [
  { label: '1 час', ms: HOUR },
  { label: '3 часа', ms: 3 * HOUR },
  { label: '1 день', ms: 24 * HOUR },
  { label: 'Пока не включу', ms: null },
];

const ITEM = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2';

interface Props {
  muted: boolean;
  isGroup: boolean;
  /** Можно ли блокировать: личный чат и собеседник не администратор */
  canBlock: boolean;
  blockedByMe: boolean;
  onMute: (ms: number | null) => void;
  onUnmute: () => void;
  onMembers: () => void;
  onToggleBlock: () => void;
}

export function ChatMenu({ muted, isGroup, canBlock, blockedByMe, onMute, onUnmute, onMembers, onToggleBlock }: Props) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setSub(false);
  };

  return (
    <div ref={box} className="relative ml-auto shrink-0">
      <button
        type="button"
        aria-label="Меню беседы"
        title="Меню"
        className="flex size-9 items-center justify-center rounded-md hover:bg-surface-2"
        onClick={() => {
          setOpen((v) => !v);
          setSub(false);
        }}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className="animate-pop-in absolute top-full right-0 z-40 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-pop">
          {sub ? (
            <>
              <button type="button" className={`${ITEM} font-medium`} onClick={() => setSub(false)}>
                <ChevronLeft size={16} aria-hidden="true" /> Отключить уведомления
              </button>
              {MUTE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={ITEM}
                  onClick={() => {
                    onMute(o.ms);
                    close();
                  }}
                >
                  {o.label}
                </button>
              ))}
            </>
          ) : (
            <>
              {muted ? (
                <button type="button" className={ITEM} onClick={() => { onUnmute(); close(); }}>
                  <Bell size={16} aria-hidden="true" /> Включить уведомления
                </button>
              ) : (
                <button type="button" className={ITEM} onClick={() => setSub(true)}>
                  <BellOff size={16} aria-hidden="true" /> Отключить уведомления
                </button>
              )}
              {isGroup ? (
                <button type="button" className={ITEM} onClick={() => { onMembers(); close(); }}>
                  <Users size={16} aria-hidden="true" /> Участники
                </button>
              ) : null}
              {canBlock ? (
                <button type="button" className={`${ITEM} text-danger`} onClick={() => { onToggleBlock(); close(); }}>
                  <Ban size={16} aria-hidden="true" /> {blockedByMe ? 'Разблокировать' : 'Заблокировать'}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}