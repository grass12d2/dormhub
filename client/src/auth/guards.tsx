import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from './AuthProvider';
import type { Role } from './user';

/** Пускает только вошедших; остальных отправляет на страницу входа */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Загрузка" />
      </div>
    );
  }
  if (!user) {
    // Запоминаем адрес, чтобы вернуть пользователя после входа
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Пускает только указанные роли; остальных возвращает на главную */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}