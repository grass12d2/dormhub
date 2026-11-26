import { Cake, GraduationCap, Home, MessageCircle, ShieldCheck, Users, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getChatProfile, type ChatProfile } from '../../api/chat';
import { facultyShort, resolveFaculty } from '../../lib/faculties';
import { formatAge } from '../../lib/format';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { UserAvatar } from '../ui/UserAvatar';

const GAP = 8;

/**
 * Карточка пользователя по нажатию на аватар в чате: имя, возраст (без даты рождения),
 * общежитие и комната (сервер отдаёт их только администратору и соседям по общежитию),
 * кнопка «Написать» открывает личный чат.
 */
export function ProfileCard({
  userId,
  name,
  anchor,
  isMe,
  onMessage,
  onClose,
}: {
  userId: string;
  /** Имя из сообщения: показывается сразу, пока карточка загружается */
  name: string;
  /** Нажатый аватар: карточка открывается рядом с ним */
  anchor: HTMLElement;
  isMe: boolean;
  onMessage: (userId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<ChatProfile | null>(null);
  const [error, setError] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number; transformOrigin: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError('');
    getChatProfile(userId)
      .then((p) => !cancelled && setProfile(p))
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить профиль');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Справа от аватара; если не помещается — слева; по вертикали остаётся в пределах экрана
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const right = a.right + GAP;
    const fitsRight = right + w + GAP <= window.innerWidth;
    const left = fitsRight ? right : Math.max(GAP, a.left - GAP - w);
    const top = Math.max(GAP, Math.min(a.top, window.innerHeight - h - GAP));
    const oy = Math.min(h, Math.max(0, a.top + a.height / 2 - top));
    setPos({ left, top, transformOrigin: `${fitsRight ? 0 : w}px ${oy}px` });
  }, [anchor, profile, error]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const down = (e: PointerEvent) => {
      const target = e.target as Node;
      // Нажатие на тот же аватар закрывает карточку его собственным обработчиком
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const shownName = profile?.name ?? name;
  // Институт — сокращённо, полное название во всплывающей подсказке
  const faculty = resolveFaculty(profile?.faculty);
  const facultyCode = facultyShort(profile?.faculty);
  const facultyTitle = faculty?.name ?? (facultyCode !== profile?.faculty?.trim() ? profile?.faculty ?? undefined : undefined);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Профиль: ${shownName}`}
      tabIndex={-1}
      className={`${pos ? 'animate-menu-in' : 'invisible'} fixed z-[90] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surface p-4 shadow-pop outline-none`}
      style={pos ?? { left: 0, top: 0 }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute top-2 right-2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
        onClick={onClose}
      >
        <X size={16} aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <UserAvatar userId={userId} name={shownName} className="size-16 text-2xl" />
        <div className="min-w-0 max-w-full">
          <p className="truncate text-base font-semibold">{shownName}</p>
          {profile?.role === 'admin' ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary">
              <ShieldCheck size={14} aria-hidden="true" /> Администратор
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        {error ? <p className="text-danger">{error}</p> : null}
        {!profile && !error ? (
          <>
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
          </>
        ) : null}
        {profile && profile.age !== null ? (
          <p className="flex items-center gap-2">
            <Cake size={16} aria-hidden="true" className="shrink-0 text-muted" />
            {formatAge(profile.age)}
          </p>
        ) : null}
        {profile?.faculty ? (
          <p className="flex items-center gap-2" title={facultyTitle}>
            <GraduationCap size={16} aria-hidden="true" className="shrink-0 text-muted" />
            <span className="min-w-0 truncate">{facultyCode}</span>
          </p>
        ) : null}
        {profile?.group ? (
          <p className="flex items-center gap-2">
            <Users size={16} aria-hidden="true" className="shrink-0 text-muted" />
            <span className="min-w-0 truncate">
              Группа <span className="tabular">{profile.group}</span>
            </span>
          </p>
        ) : null}
        {profile?.place ? (
          <p className="flex items-center gap-2">
            <Home size={16} aria-hidden="true" className="shrink-0 text-muted" />
            <span>
              Общежитие {profile.place.buildingNumber}, комната <span className="tabular">{profile.place.roomNumber}</span>
            </span>
          </p>
        ) : null}
      </div>

      {isMe ? null : (
        <Button
          className="mt-4 w-full"
          size="sm"
          icon={<MessageCircle size={16} aria-hidden="true" />}
          onClick={() => {
            onMessage(userId);
            onClose();
          }}
        >
          Написать
        </Button>
      )}
    </div>,
    document.body
  );
}
