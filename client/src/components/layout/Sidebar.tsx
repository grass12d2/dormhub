import { NavLink } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { groupItems, navFor } from '../../nav';

/** Боковая панель (с ширины 1024px) под шапкой: меню по группам; скрывается кнопкой меню */
export function Sidebar({ open }: { open: boolean }) {
  const { user } = useAuth();
  if (!user) {
    return null;
  }

  return (
    <aside
      // inert: скрытая панель не получает фокус с клавиатуры
      inert={!open}
      className={`fixed top-16 bottom-0 left-0 z-30 hidden w-[15.5rem] flex-col border-r border-border bg-surface transition-transform duration-200 lg:flex ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <nav aria-label="Основное меню" className="flex-1 overflow-y-auto px-3 py-4">
        {groupItems(navFor(user.role)).map(({ group, items }) => (
          <div key={group} className="mt-4 first:mt-0">
            <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">{group}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === '/'}
                    className={({ isActive }) =>
                      `flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-soft text-primary'
                          : 'text-muted hover:bg-surface-2 hover:text-fg'
                      }`
                    }
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}