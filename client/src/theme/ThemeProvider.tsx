import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SETTINGS,
  THEME_STORAGE_KEY,
  parseSettings,
  resolveMode,
  serializeSettings,
  type Accent,
  type Mode,
  type ThemeSettings,
} from './theme';

interface ThemeContextValue extends ThemeSettings {
  /** Фактическая тема после учёта настроек системы */
  resolved: 'light' | 'dark';
  setMode: (mode: Mode) => void;
  setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSettings(): ThemeSettings {
  try {
    return parseSettings(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(readSettings);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  // Следим за переключением темы в операционной системе
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveMode(settings.mode, systemDark);

  // Атрибуты на <html>; на два кадра отключаются переходы, чтобы смена темы не мерцала
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-changing');
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-accent', settings.accent);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => root.classList.remove('theme-changing'));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [resolved, settings.accent]);

  // Сохраняем выбор пользователя
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, serializeSettings(settings));
    } catch {
      // Хранилище недоступно (приватный режим): тема просто не сохранится
    }
  }, [settings]);

  const setMode = useCallback((mode: Mode) => setSettings((prev) => ({ ...prev, mode })), []);
  const setAccent = useCallback(
    (accent: Accent) => setSettings((prev) => ({ ...prev, accent })),
    []
  );

  const value = useMemo(
    () => ({ ...settings, resolved, setMode, setAccent }),
    [settings, resolved, setMode, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme должен вызываться внутри ThemeProvider');
  }
  return value;
}