import { CheckCheck, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listAnnouncements, markAllAnnouncementsRead, markAnnouncementRead } from '../api/announcements';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { ANNOUNCEMENTS_EVENT } from '../lib/useUnreadCount';

const PAGE_SIZE = 20;
/** Как часто страница тихо проверяет новые объявления, мс */
const POLL_MS = 10_000;

/** «Объявления» студента: список обновляется сам, отметки без перезагрузки */
export default function AnnouncementsStudentPage() {
    const [page, setPage] = useState(1);
    const list = useAsync(() => listAnnouncements({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [page]);
    const { refresh } = list;
    const total = list.data?.meta.total ?? 0;
    const items = list.data?.items ?? [];

    // Локальные отметки: интерфейс меняется сразу, список не перезагружается
    const [readIds, setReadIds] = useState<string[]>([]);
    const [markingAll, setMarkingAll] = useState(false);
    const isRead = (a: { id: string; isRead: boolean }) => a.isRead || readIds.includes(a.id);
    const unreadCount = items.filter((a) => !isRead(a)).length;

    // Тихое обновление: по событию (число непрочитанных изменилось) и по таймеру
    useEffect(() => {
        const onChange = () => refresh();
        window.addEventListener(ANNOUNCEMENTS_EVENT, onChange);
        const timer = window.setInterval(() => {
            if (!document.hidden) refresh();
        }, POLL_MS);
        return () => {
            window.removeEventListener(ANNOUNCEMENTS_EVENT, onChange);
            window.clearInterval(timer);
        };
    }, [refresh]);

    const markRead = async (id: string) => {
        setReadIds((prev) => [...prev, id]);
        try {
            await markAnnouncementRead(id);
            window.dispatchEvent(new Event(ANNOUNCEMENTS_EVENT));
        } catch {
            setReadIds((prev) => prev.filter((x) => x !== id));
        }
    };

    const markAll = async () => {
        const ids = items.filter((a) => !isRead(a)).map((a) => a.id);
        setReadIds((prev) => [...prev, ...ids]);
        setMarkingAll(true);
        try {
            await markAllAnnouncementsRead();
            window.dispatchEvent(new Event(ANNOUNCEMENTS_EVENT));
        } catch {
            setReadIds((prev) => prev.filter((x) => !ids.includes(x)));
        } finally {
            setMarkingAll(false);
        }
    };

    return (
        <>
            <PageHeader
                title="Объявления"
                description="Сообщения администрации для вас."
                actions={
                    <Button
                        variant="secondary"
                        icon={<CheckCheck size={16} aria-hidden="true" />}
                        loading={markingAll}
                        disabled={unreadCount === 0}
                        onClick={() => void markAll()}
                    >
                        Прочитать все
                    </Button>
                }
            />
            {list.error && !list.data ? (
                <Warning tone="danger" title="Не удалось загрузить объявления">
                    <p>{list.error}</p>
                    <Button variant="secondary" size="sm" className="mt-2" onClick={list.reload}>
                        Повторить
                    </Button>
                </Warning>
            ) : list.loading && !list.data ? (
                <Skeleton className="h-32 w-full" />
            ) : items.length === 0 ? (
                <Card>
                    <EmptyState icon={Megaphone} title="Объявлений нет" description="Новые сообщения появятся здесь." />
                </Card>
            ) : (
                <div className="flex max-w-3xl flex-col gap-3">
                    {items.map((a) => (
                        <Card key={a.id} className={`flex flex-col gap-2 p-5 ${isRead(a) ? '' : 'border-primary'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-xl font-bold">{a.title}</h2>
                                {isRead(a) ? null : <Badge tone="primary">Новое</Badge>}
                            </div>
                            <p className="text-base leading-relaxed whitespace-pre-wrap">{a.body}</p>
                            <div className="flex items-center justify-between gap-2">
                                <span className="tabular text-xs text-muted">{formatDateTime(a.createdAt)}</span>
                                {isRead(a) ? null : (
                                    <Button variant="secondary" size="sm" onClick={() => void markRead(a.id)}>
                                        Прочитано
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                    {total > PAGE_SIZE ? (
                        <div className="flex items-center justify-between">
                            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                Назад
                            </Button>
                            <span className="tabular text-sm text-muted">
                                Страница {page} из {Math.ceil(total / PAGE_SIZE)}
                            </span>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={page >= Math.ceil(total / PAGE_SIZE)}
                                onClick={() => setPage(page + 1)}
                            >
                                Вперёд
                            </Button>
                        </div>
                    ) : null}
                </div>
            )}
        </>
    );
}