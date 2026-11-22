import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, UNAUTHORIZED_EVENT } from '../api';
import { ApiError, sessionTokenStore } from '../api/client';
import { parseUser, type AuthUser } from './user';

interface AuthContextValue {
  user: AuthUser | null;
  /** Идёт восстановление сессии по сохранённому токену */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => sessionTokenStore.get() !== null);

  // Восстановление сессии: если в хранилище есть токен, спрашиваем сервер, кто это
  useEffect(() => {
    if (!sessionTokenStore.get()) {
      return;
    }
    let cancelled = false;
    api
      .get<unknown>('/auth/me')
      .then((response) => {
        if (cancelled) {
          return;
        }
        const restored = parseUser(response.data);
        if (!restored) {
          sessionTokenStore.clear();
        }
        setUser(restored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Сервер отклонил токен: выходим из системы
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<{ token: string; user: unknown }>('/auth/login', {
      email,
      password,
    });
    const loggedIn = parseUser(response.data.user);
    if (!loggedIn) {
      throw new ApiError(500, 'Некорректный ответ сервера');
    }
    sessionTokenStore.set(response.data.token);
    setUser(loggedIn);
  }, []);

  const logout = useCallback(() => {
    sessionTokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth должен вызываться внутри AuthProvider');
  }
  return value;
}