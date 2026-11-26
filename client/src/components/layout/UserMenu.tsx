import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Avatar } from '../ui/Avatar';
import { useProfileName } from '../../lib/useDisplayName';
import { MENU_HEAD, MENU_ITEM, MENU_PANEL } from './menuStyles';

/** Отображаемое имя: пока сервер не отдаёт имя, берётся часть почты до «@» */
export function displayNameOf(email: string): string {
    return email.split('@')[0] || email;
}

const ITEM = MENU_ITEM;

/** Кнопка с именем; по нажатию — окно с почтой и пунктами «Мой профиль», «Безопасность», «Выйти» */
export function UserMenu() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const profileName = useProfileName(user?.email);

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
    const name = profileName ?? displayNameOf(user.email);

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
                className="flex h-10 max-w-[24rem] min-w-0 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-surface-2"
            >
                <Avatar name={name} className="size-8 text-sm" />
                <span className="hidden min-w-0 text-sm font-medium whitespace-nowrap sm:inline">{name}</span>
                <ChevronDown size={16} className="hidden text-muted sm:block" aria-hidden="true" />
            </button>
            {open ? (
                <div
                    role="menu"
                    className={MENU_PANEL}
                >
                    <div className={MENU_HEAD}>
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