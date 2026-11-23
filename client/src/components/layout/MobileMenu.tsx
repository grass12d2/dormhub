import { NavLink } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { useUnreadCount } from '../../lib/useUnreadCount';
import { groupItems, navFor } from '../../nav';
import { CountBadge } from '../ui/CountBadge';
import { Modal } from '../ui/Modal';

/** Полное меню в окне: открывается на планшете и телефоне */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const unread = useUnreadCount();
  if (!user) {
    return null;
  }

  return (
    <Modal open={open} title="Меню" onClose={onClose}>
      <nav aria-label="Полное меню" className="flex flex-col gap-4">
        {groupItems(navFor(user.role)).map(({ group, items }) => (
          <div key={group}>
            <p className="pb-1 text-xs font-medium tracking-wide text-muted uppercase">{group}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                        isActive ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2'
                      }`
                    }
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                    {path === '/announcements' ? <CountBadge count={unread} /> : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </Modal>
  );
}