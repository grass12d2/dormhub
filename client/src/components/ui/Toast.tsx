import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'danger' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
/** Через сколько миллисекунд уведомление исчезает само */
const LIFETIME_MS = 5000;

const ICONS = { success: CheckCircle2, danger: AlertCircle, info: Info } as const;
const COLORS: Record<ToastTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Уведомления в правом нижнем углу, у каждого есть кнопка закрытия */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {items.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <div
              key={item.id}
              className="animate-pop-in pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-pop"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${COLORS[item.tone]}`} aria-hidden="true" />
              <p className="flex-1 text-sm">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Закрыть уведомление"
                className="rounded-md p-0.5 text-muted transition-colors hover:bg-surface-2"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast должен вызываться внутри ToastProvider');
  }
  return value;
}