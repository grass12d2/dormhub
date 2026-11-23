import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth, RequireRole } from './auth/guards';
import { AppShell } from './components/layout/AppShell';
import { sectionRoutes } from './nav';
import AppearancePage from './pages/AppearancePage';
import BuildingsPage from './pages/BuildingsPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import NotificationSettingsPage from './pages/NotificationSettingsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ProfilePage from './pages/ProfilePage';
import SecurityPage from './pages/SecurityPage';
import SettingsPage from './pages/SettingsPage';
import BedsPage from './pages/BedsPage';
import RoomsPage from './pages/RoomsPage';
import StudentsPage from './pages/StudentsPage';

/** Готовые страницы разделов; для остальных путей показывается страница-заглушка */
const PAGES: Record<string, ReactElement> = {
    '/buildings': <BuildingsPage />,
    '/rooms': <RoomsPage />,
    '/beds': <BedsPage />,
    '/students': <StudentsPage />,
};

/** Маршруты: вход открыт, остальное доступно после входа, разделы ограничены по ролям */
export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
                element={
                    <RequireAuth>
                        <AppShell />
                    </RequireAuth>
                }
            >
                <Route index element={<DashboardPage />} />
                {sectionRoutes().map(({ path, roles }) => (
                    <Route
                        key={path}
                        path={path.slice(1)}
                        element={<RequireRole roles={roles}>{PAGES[path] ?? <PlaceholderPage />}</RequireRole>}
                    />
                ))}
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/appearance" element={<AppearancePage />} />
                <Route path="settings/notifications" element={<NotificationSettingsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="security" element={<SecurityPage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}