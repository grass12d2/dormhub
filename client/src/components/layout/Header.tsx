import { Menu, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { currentPlatform, shortcutLabel } from '../../lib/platform';
import { Logo } from './Logo';
import { HEADER_ICON_BUTTON } from './menuStyles';
import { SearchDialog } from './SearchDialog';
import { ThemeMenu } from './ThemeMenu';
import { UserMenu } from './UserMenu';

export interface HeaderProps {
  /** Одна кнопка: на десктопе скрывает/показывает панель, на узких экранах открывает меню */
  onMenu: () => void;
  sidebarOpen: boolean;
}

/** Верхняя панель на всю ширину: меню и логотип, поиск по центру, тема и пользователь */
export function Header({ onMenu, sidebarOpen }: HeaderProps) {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const isAdmin = user?.role === 'admin';
  const shortcut = shortcutLabel(currentPlatform(), 'K');

  // Сочетание ⌘K / Ctrl+K открывает поиск администратора
  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isAdmin]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface px-3 md:gap-8 md:px-5">
      {/* Слева: кнопка меню и логотип */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Меню"
          aria-expanded={sidebarOpen}
          title="Меню"
          className={HEADER_ICON_BUTTON}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <Logo />
      </div>

      {/* По центру: строка поиска (на телефоне скрыта); поля по бокам не дают ей подойти к логотипу */}
      <div className="flex min-w-0 justify-center lg:px-4">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Открыть поиск"
            className="hidden h-10 w-full max-w-[32rem] items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-left text-sm text-muted transition-colors hover:border-primary md:flex"
          >
            <Search size={16} aria-hidden="true" />
            <span className="flex-1 truncate">Поиск</span>
            <kbd className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-xs font-medium whitespace-nowrap">
              {shortcut}
            </kbd>
          </button>
        ) : null}
      </div>

      {/* Справа: поиск (на телефоне), внешний вид и пользователь */}
      <div className="flex items-center justify-end gap-1">
        {isAdmin ? (
          <>
            <button
              type="button"
              className={`${HEADER_ICON_BUTTON} md:hidden`}
              onClick={() => setSearchOpen(true)}
              aria-label="Поиск"
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <SearchDialog open={searchOpen} onClose={closeSearch} />
          </>
        ) : null}
        <ThemeMenu />
        <UserMenu />
      </div>
    </header>
  );
}