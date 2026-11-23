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

/** Результат первого шага входа: либо вход выполнен, либо нужен код второго шага */
export type LoginOutcome = { twoFactorRequired: false } | { twoFactorRequired: true; challengeToken: string };

interface AuthContextValue {
  user: AuthUser | null;
  /** Идёт восстановление сессии по сохранённому токену */
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionData {
  token: string;
  user: unknown;
}

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

  /** Сохранить сессию из ответа сервера */
  const finish = useCallback((data: SessionData) => {
    const loggedIn = parseUser(data.user);
    if (!loggedIn) {
      throw new ApiError(500, 'Некорректный ответ сервера');
    }
    sessionTokenStore.set(data.token);
    setUser(loggedIn);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const response = await api.post<
        SessionData | { twoFactorRequired: true; challengeToken: string }
      >('/auth/login', { email, password });
      const data = response.data;
      if ('twoFactorRequired' in data && data.twoFactorRequired) {
        return { twoFactorRequired: true, challengeToken: data.challengeToken };
      }
      finish(data as SessionData);
      return { twoFactorRequired: false };
    },
    [finish]
  );

  const verifyTwoFactor = useCallback(
    async (challengeToken: string, code: string) => {
      const response = await api.post<SessionData>('/auth/login/2fa', { challengeToken, code });
      finish(response.data);
    },
    [finish]
  );

  const logout = useCallback(() => {
    sessionTokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, verifyTwoFactor, logout }),
    [user, loading, login, verifyTwoFactor, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth должен вызываться внутри AuthProvider');
  }
  return value;
}