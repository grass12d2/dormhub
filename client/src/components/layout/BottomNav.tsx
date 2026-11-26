import { MoreHorizontal } from 'lucide-react';
import { NavLink } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { useUnreadCount } from '../../lib/useUnreadCount';
import { bottomNavFor } from '../../nav';
import { useChatUnread } from '../../lib/useChatUnread';

/** Нижняя панель на телефоне: четыре главных раздела (Обзор, Моё жильё или Студенты, Чат, Счета) и кнопка «Ещё» с отметкой о новых объявлениях */
export function BottomNav({ onMore }: { onMore: () => void }) {
    const { user } = useAuth();
    const unread = useUnreadCount();
    const chatUnread = useChatUnread();
    if (!user) {
        return null;
    }
    const items = bottomNavFor(user.role);

    const base = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-xs leading-tight font-medium';
    return (
        <nav
            aria-label="Быстрая навигация"
            className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-surface md:hidden"
        >
            {items.map(({ path, label, short, icon: Icon }) => (
                <NavLink
                    key={path}
                    to={path}
                    end={path === '/'}
                    aria-label={short ? label : undefined}
                    className={({ isActive }) => `${base} ${isActive ? 'text-primary' : 'text-muted'}`}
                >
                    <Icon size={20} className="shrink-0" aria-hidden="true" />
                    <span className="max-w-full truncate">{short ?? label}</span>
                </NavLink>
            ))}
            <button type="button" onClick={onMore} className={`${base} relative text-muted`}>
                <MoreHorizontal size={20} className="shrink-0" aria-hidden="true" />
                <span className="max-w-full truncate">Ещё</span>
                {unread + chatUnread > 0 ? (
                    <span
                        aria-label={`Непрочитанных: ${unread + chatUnread}`}
                        className="absolute top-2 right-1/4 size-2.5 rounded-full bg-primary"
                    />
                ) : null}
            </button>
        </nav>
    );
}