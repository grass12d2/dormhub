import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { BottomNav } from './BottomNav';
import { Breadcrumbs } from './Breadcrumbs';
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
        className={`flex min-h-[calc(100vh-4rem)] flex-col transition-[padding] duration-200 ${
          sidebarOpen ? 'lg:pl-[15.5rem]' : ''
        }`}
      >
        <main className="mx-auto w-full max-w-[1280px] flex-1 p-4 pb-24 md:p-6 md:pb-8 lg:p-8">
          {/* Хлебные крошки на странице, а не в шапке */}
          <div className="mb-4">
            <Breadcrumbs />
          </div>
          {/* key по пути: при смене страницы содержимое плавно проявляется */}
          <div key={pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>
      <BottomNav onMore={() => setMenuOpen(true)} />
      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </div>
  );
}