import { useEffect, useState } from 'react';
import { getUnreadCount } from '../api/announcements';
import { useAuth } from '../auth/AuthProvider';

/** Ключ события: список объявлений изменился (отметка «прочитано») */
export const ANNOUNCEMENTS_EVENT = 'dormhub:announcements-changed';

/** Число непрочитанных объявлений студента; у администратора всегда 0 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'student') {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      getUnreadCount()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(ANNOUNCEMENTS_EVENT, load);
    // Периодическое обновление раз в минуту
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.removeEventListener(ANNOUNCEMENTS_EVENT, load);
      window.clearInterval(timer);
    };
  }, [user]);

  return count;
}