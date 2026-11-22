import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';

/** Отображаемое имя: пока сервер не отдаёт имя, берётся часть почты до «@» */
export function displayNameOf(email: string): string {
  return email.split('@')[0] || email;
}

const ITEM =
  'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-2';

/** Кнопка с именем; по нажатию — окно с почтой и пунктами «Мой профиль», «Безопасность», «Выйти» */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) {
    return null;
  }
  const name = displayNameOf(user.email);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-sm font-medium text-primary uppercase"
        >
          {name.charAt(0)}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
        <ChevronDown size={16} className="hidden text-muted sm:block" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-pop-in absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-pop"
        >
          <div className="border-b border-border px-3 pt-1 pb-3">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="pt-2">
            <button type="button" role="menuitem" className={ITEM} onClick={() => go('/profile')}>
              <UserRound size={18} aria-hidden="true" />
              Мой профиль
            </button>
            <button type="button" role="menuitem" className={ITEM} onClick={() => go('/security')}>
              <ShieldCheck size={18} aria-hidden="true" />
              Безопасность
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${ITEM} text-danger`}
              onClick={handleLogout}
            >
              <LogOut size={18} aria-hidden="true" />
              Выйти
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}