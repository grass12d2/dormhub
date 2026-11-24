import { useEffect, useRef, useState } from 'react';
import { CHAT_EVENT, getChatUnread } from '../api/chat';
import { useAuth } from '../auth/AuthProvider';

/** Число непрочитанных сообщений и сигнал о новом сообщении (для всплывающей подсказки) */
export function useChatUnread(onNew?: () => void): number {
    const { user } = useAuth();
    const [count, setCount] = useState(0);
    const last = useRef<number | null>(null);
    const notify = useRef(onNew);
    notify.current = onNew;

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        const load = () => {
            getChatUnread()
                .then((n) => {
                    if (cancelled) return;
                    // Сигнал только при росте числа непрочитанных
                    if (last.current !== null && n > last.current) notify.current?.();
                    last.current = n;
                    setCount(n);
                })
                .catch(() => undefined);
        };
        load();
        window.addEventListener(CHAT_EVENT, load);
        // Опрос идёт и в фоновой вкладке; при возврате на вкладку число обновляется сразу
        const timer = window.setInterval(load, 5_000);
        const onVisible = () => {
            if (!document.hidden) load();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            window.removeEventListener(CHAT_EVENT, load);
            document.removeEventListener('visibilitychange', onVisible);
            window.clearInterval(timer);
        };
    }, [user]);

    return count;
}