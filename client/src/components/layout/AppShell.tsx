import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnnouncementPopup } from './AnnouncementPopup';
import { BottomNav } from './BottomNav';
import { Breadcrumbs } from './Breadcrumbs';
import { ChatToast } from './ChatToast';
import { Footer } from './Footer';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { Sidebar } from './Sidebar';

const SIDEBAR_KEY = 'dormhub.sidebar';
/** Ширина, с которой показывается боковая панель (совпадает с lg в Tailwind) */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** Состояние боковой панели хранится в браузере; по умолчанию панель открыта */
function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
  } catch {
    return true;
  }
}

/** Каркас страниц после входа: шапка на всю ширину, под ней панель и содержимое */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const { pathname } = useLocation();
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Страница чата занимает всю высоту: без подвала и с меньшим отступом снизу
  const isChat = pathname === '/chat';

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed');
    } catch {
      // Хранилище недоступно: состояние просто не сохранится
    }
  }, [sidebarOpen]);

  // Одна кнопка меню: на широком экране скрывает панель, на узком открывает окно меню
  const handleMenu = useCallback(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      setSidebarOpen((prev) => !prev);
    } else {
      setMenuOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen pt-16">
      <Header onMenu={handleMenu} sidebarOpen={sidebarOpen} />
      <Sidebar open={sidebarOpen} />
      <div
        className={`flex min-h-[calc(100vh-4rem)] flex-col transition-[padding] duration-200 ${sidebarOpen ? 'lg:pl-[15.5rem]' : ''
          }`}
      >
        <main
          className={`mx-auto flex w-full max-w-[1280px] flex-1 flex-col p-4 md:p-6 lg:p-8 ${isChat ? 'pb-20 md:pb-6 lg:pb-8' : 'pb-24 md:pb-8'
            }`}
        >
          <div className="mb-4 shrink-0">
            <Breadcrumbs />
          </div>
          <div key={pathname} className="animate-fade-in flex min-h-0 flex-1 flex-col">
            <Outlet />
            <AnnouncementPopup />
          </div>
        </main>
        <ChatToast />
        {isChat ? (
          <div className="hidden md:block">
            <Footer />
          </div>
        ) : (
          <Footer />
        )}
      </div>
      <BottomNav onMore={() => setMenuOpen(true)} />
      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </div>
  );
}