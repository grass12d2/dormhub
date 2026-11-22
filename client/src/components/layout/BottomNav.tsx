import { MoreHorizontal } from 'lucide-react';
import { NavLink } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { navFor } from '../../nav';

/** Нижняя панель на телефоне: четыре главных раздела и кнопка «Ещё» */
export function BottomNav({ onMore }: { onMore: () => void }) {
    const { user } = useAuth();
    if (!user) {
        return null;
    }
    const items = navFor(user.role).filter((item) => item.bottom);

    const base = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium';
    return (
        <nav
            aria-label="Быстрая навигация"
            className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-surface md:hidden"
        >
            {items.map(({ path, label, icon: Icon }) => (
                <NavLink
                    key={path}
                    to={path}
                    end={path === '/'}
                    className={({ isActive }) => `${base} ${isActive ? 'text-primary' : 'text-muted'}`}
                >
                    <Icon size={20} aria-hidden="true" />
                    {label}
                </NavLink>
            ))}
            <button type="button" onClick={onMore} className={`${base} text-muted`}>
                <MoreHorizontal size={20} aria-hidden="true" />
                Ещё
            </button>
        </nav>
    );
}