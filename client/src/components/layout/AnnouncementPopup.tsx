import { Megaphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { getUnreadCount, listAnnouncements, type Announcement } from '../../api/announcements';
import { useAuth } from '../../auth/AuthProvider';
import { readNotifyPrefs, readSeenIds, writeSeenIds } from '../../lib/notifyPrefs';
import { ANNOUNCEMENTS_EVENT } from '../../lib/useUnreadCount';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** Как часто спрашивать сервер о новых объявлениях, мс */
const POLL_MS = 10_000;

/** Всплывающее окно: появляется при входе и в течение работы, когда приходит новое объявление */
export function AnnouncementPopup() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [queue, setQueue] = useState<Announcement[]>([]);
    const lastCount = useRef(-1);

    useEffect(() => {
        if (user?.role !== 'student') {
            return;
        }
        let cancelled = false;

        const check = async () => {
            if (document.hidden || !readNotifyPrefs().news) {
                return;
            }
            try {
                const count = await getUnreadCount();
                // Дешёвая проверка: список загружается, только если число непрочитанных изменилось
                if (count === lastCount.current) {
                    return;
                }
                lastCount.current = count;
                window.dispatchEvent(new Event(ANNOUNCEMENTS_EVENT));
                if (count === 0) {
                    return;
                }
                const page = await listAnnouncements({ limit: 50, offset: 0 });
                const seen = readSeenIds();
                const fresh = page.items.filter((a) => !a.isRead && !seen.includes(a.id));
                if (!cancelled && fresh.length > 0) {
                    writeSeenIds([...seen, ...fresh.map((a) => a.id)]);
                    setQueue((prev) => [...prev, ...fresh]);
                }
            } catch {
                // Сеть недоступна: повторим при следующем опросе
            }
        };

        void check();
        const timer = window.setInterval(() => void check(), POLL_MS);
        const onVisible = () => {
            if (!document.hidden) void check();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [user]);

    const first = queue[0];
    if (!first) {
        return null;
    }
    const next = () => setQueue((prev) => prev.slice(1));

    return (
        <Modal open title="Новое объявление" onClose={next}>
            <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2 text-primary">
                    <span className="flex h-7 shrink-0 items-center">
                        <Megaphone size={20} aria-hidden="true" />
                    </span>
                    <h3 className="text-lg leading-7 font-bold text-fg">{first.title}</h3>
                </div>
                <p className="text-base leading-relaxed whitespace-pre-wrap">{first.body}</p>
                {queue.length > 1 ? <p className="text-sm text-muted">Ещё новых: {queue.length - 1}</p> : null}
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={next}>{queue.length > 1 ? 'Дальше' : 'Закрыть'}</Button>
                    <Button onClick={() => { setQueue([]); navigate('/announcements'); }}>Открыть все</Button>
                </div>
            </div>
        </Modal>
    );
}