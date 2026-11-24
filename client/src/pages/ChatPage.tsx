import { ArrowLeft, CheckCheck, MessageCircle, Plus, Search, Send, Users, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
    CHAT_EVENT,
    listChats,
    listMessages,
    markAllChatsRead,
    markChatRead,
    openDirectChat,
    searchPeople,
    sendMessage,
    type ChatMessage,
    type ChatPerson,
    type ChatSummary,
} from '../api/chat';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { CountBadge } from '../components/ui/CountBadge';
import { AnnouncementBody } from '../components/ui/RichText';
import { Skeleton } from '../components/ui/Skeleton';
import { UserAvatar } from '../components/ui/UserAvatar';
import { buildRows, formatFull, formatTime, mergeMessages } from '../lib/chatLayout';
import { useAsync } from '../lib/useAsync';

const PAGE = 50;
const MESSAGES_POLL_MS = 3_000;
const LIST_POLL_MS = 10_000;

/** Значок чата в списке: у личного — аватар собеседника, у группового — иконка */
function ChatIcon({ chat }: { chat: ChatSummary }) {
    return chat.kind === 'direct' ? (
        <UserAvatar userId={chat.otherUserId} name={chat.title} className="size-11" />
    ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Users size={20} aria-hidden="true" />
        </span>
    );
}

/** Страница «Чат»: слева список бесед, справа переписка (на телефоне по одному экрану) */
export default function ChatPage() {
    const { user } = useAuth();
    const chats = useAsync(listChats);
    const { refresh } = chats;
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [markingAll, setMarkingAll] = useState(false);

    // Поиск собеседника для нового сообщения
    const [composing, setComposing] = useState(false);
    const [query, setQuery] = useState('');
    const [people, setPeople] = useState<ChatPerson[]>([]);

    const scroller = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const stick = useRef(true);
    const lastRead = useRef(0);

    const list = useMemo(() => chats.data ?? [], [chats.data]);
    const selected = list.find((c) => c.id === selectedId) ?? null;
    const rows = useMemo(() => buildRows(messages), [messages]);
    const totalUnread = list.reduce((sum, c) => sum + c.unread, 0);

    // Список бесед обновляется по таймеру и по событию
    useEffect(() => {
        const onChange = () => refresh();
        window.addEventListener(CHAT_EVENT, onChange);
        const timer = window.setInterval(() => {
            if (!document.hidden) refresh();
        }, LIST_POLL_MS);
        return () => {
            window.removeEventListener(CHAT_EVENT, onChange);
            window.clearInterval(timer);
        };
    }, [refresh]);

    // Переписка выбранной беседы: первая загрузка и опрос каждые 3 секунды
    useEffect(() => {
        setMessages([]);
        setError('');
        setHasMore(false);
        lastRead.current = 0;
        stick.current = true;
        if (selectedId === null) return;
        let cancelled = false;
        let first = true;
        const load = async () => {
            try {
                const fresh = await listMessages(selectedId, { limit: PAGE });
                if (cancelled) return;
                setMessages((prev) => mergeMessages(prev, fresh));
                if (first) setHasMore(fresh.length >= PAGE);
            } catch (caught) {
                if (!cancelled && first) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сообщения');
            } finally {
                if (!cancelled) {
                    first = false;
                    setLoadingMessages(false);
                }
            }
        };
        setLoadingMessages(true);
        void load();
        const timer = window.setInterval(() => {
            if (!document.hidden) void load();
        }, MESSAGES_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [selectedId]);

    // Новые сообщения помечаются прочитанными
    useEffect(() => {
        if (selectedId === null || messages.length === 0) return;
        const lastId = messages[messages.length - 1].id;
        if (lastId <= lastRead.current) return;
        lastRead.current = lastId;
        markChatRead(selectedId).then(
            () => window.dispatchEvent(new Event(CHAT_EVENT)),
            () => undefined
        );
    }, [messages, selectedId]);

    // Прокрутка вниз при новых сообщениях, если читатель у конца ленты
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    // Высота поля ввода растёт с числом строк, но не более 40% высоты окна
    useLayoutEffect(() => {
        const el = input.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
    }, [text, selectedId]);

    // Поиск людей с задержкой, чтобы не спрашивать сервер на каждый символ
    useEffect(() => {
        const q = query.trim();
        if (!composing || q.length === 0) {
            setPeople([]);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            searchPeople(q).then(
                (found) => {
                    if (!cancelled) setPeople(found);
                },
                () => undefined
            );
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [query, composing]);

    const onScroll = () => {
        const el = scroller.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    const loadOlder = async () => {
        if (selectedId === null || messages.length === 0) return;
        const el = scroller.current;
        const before = el?.scrollHeight ?? 0;
        try {
            const older = await listMessages(selectedId, { before: messages[0].id, limit: PAGE });
            setHasMore(older.length >= PAGE);
            stick.current = false;
            setMessages((prev) => mergeMessages(prev, older));
            // Положение прокрутки сохраняется: добавленное сверху не сдвигает видимое
            requestAnimationFrame(() => {
                if (el) el.scrollTop += el.scrollHeight - before;
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сообщения');
        }
    };

    const submit = async () => {
        const body = text.trim();
        if (!body || selectedId === null || sending) return;
        setSending(true);
        setError('');
        try {
            await sendMessage(selectedId, body);
            setText('');
            stick.current = true;
            const fresh = await listMessages(selectedId, { limit: PAGE });
            setMessages((prev) => mergeMessages(prev, fresh));
            window.dispatchEvent(new Event(CHAT_EVENT));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось отправить сообщение');
        } finally {
            setSending(false);
            input.current?.focus();
        }
    };

    // Enter отправляет, Shift+Enter — новая строка
    const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
        }
    };

    const markAll = async () => {
        setMarkingAll(true);
        try {
            await markAllChatsRead();
            refresh();
            window.dispatchEvent(new Event(CHAT_EVENT));
        } finally {
            setMarkingAll(false);
        }
    };

    const startWith = async (userId: string) => {
        try {
            const id = await openDirectChat(userId);
            setComposing(false);
            setQuery('');
            refresh();
            setSelectedId(id);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось открыть чат');
        }
    };

    const myId = user?.id ?? '';

    return (
        // До md есть нижняя панель (4rem), поэтому высота меньше; с md панели нет
        <div className="flex min-h-80 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
            {/* Список бесед */}
            <aside className={`${selected ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-border md:w-80 md:shrink-0`}>
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h1 className="text-lg font-bold">Чат</h1>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<CheckCheck size={16} aria-hidden="true" />}
                            loading={markingAll}
                            disabled={totalUnread === 0}
                            onClick={() => void markAll()}
                        >
                            Прочитать все
                        </Button>
                        <Button variant="ghost" size="sm" aria-label="Новое сообщение" title="Новое сообщение" onClick={() => setComposing((p) => !p)}>
                            {composing ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        </Button>
                    </div>
                </div>

                {composing ? (
                    <div className="border-b border-border p-3">
                        <div className="flex items-center gap-2 rounded-lg border border-border px-2">
                            <Search size={16} aria-hidden="true" className="text-muted" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Имя, номер студента или комната"
                                aria-label="Поиск собеседника"
                                className="h-9 flex-1 bg-transparent outline-none"
                            />
                        </div>
                        <ul className="mt-2 max-h-60 overflow-y-auto">
                            {people.map((p) => (
                                <li key={p.userId}>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                                        onClick={() => void startWith(p.userId)}
                                    >
                                        <UserAvatar userId={p.userId} name={p.name} className="size-9" />
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium">{p.name}</span>
                                            <span className="block truncate text-xs text-muted">
                                                {p.role === 'admin' ? 'Администратор' : (p.place ?? 'Студент')}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                            {query.trim() && people.length === 0 ? (
                                <li className="px-2 py-2 text-sm text-muted">Никого не найдено</li>
                            ) : null}
                        </ul>
                    </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {chats.loading && !chats.data ? (
                        <Skeleton className="m-4 h-24" />
                    ) : list.length === 0 ? (
                        <p className="p-4 text-sm text-muted">Бесед пока нет.</p>
                    ) : (
                        <ul>
                            {list.map((chat) => (
                                <li key={chat.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(chat.id)}
                                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${chat.id === selectedId ? 'bg-primary-soft' : ''
                                            }`}
                                    >
                                        <ChatIcon chat={chat} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium">{chat.title}</span>
                                                {chat.lastMessage ? (
                                                    <span className="tabular shrink-0 text-xs text-muted">{formatTime(chat.lastMessage.createdAt)}</span>
                                                ) : null}
                                            </span>
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="truncate text-sm text-muted">{chat.lastMessage?.text ?? 'Сообщений пока нет'}</span>
                                                <CountBadge count={chat.unread} />
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>

            {/* Переписка */}
            <section className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
                {selected ? (
                    <>
                        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                            <Button variant="ghost" size="sm" className="md:hidden" aria-label="К списку бесед" onClick={() => setSelectedId(null)}>
                                <ArrowLeft size={18} aria-hidden="true" />
                            </Button>
                            <ChatIcon chat={selected} />
                            <h2 className="min-w-0 truncate font-semibold">{selected.title}</h2>
                        </header>

                        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            {hasMore ? (
                                <div className="mb-3 text-center">
                                    <Button variant="secondary" size="sm" onClick={() => void loadOlder()}>
                                        Загрузить ранние сообщения
                                    </Button>
                                </div>
                            ) : null}
                            {loadingMessages && messages.length === 0 ? <Skeleton className="h-24" /> : null}
                            {!loadingMessages && messages.length === 0 && !error ? (
                                <p className="py-10 text-center text-sm text-muted">Сообщений пока нет. Напишите первым.</p>
                            ) : null}

                            <div className="flex flex-col gap-3">
                                {rows.map((row) => {
                                    if (row.kind === 'day') {
                                        return (
                                            <div key={row.key} className="my-2 flex justify-center">
                                                <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">{row.label}</span>
                                            </div>
                                        );
                                    }
                                    const mine = row.senderId === myId;
                                    return (
                                        <div key={row.key} className={`flex items-start gap-2 ${mine ? 'justify-end' : ''}`}>
                                            {/* Аватар только у чужих сообщений, по верху первого пузыря группы */}
                                            {mine ? null : <UserAvatar userId={row.senderId} name={row.senderName} className="size-9" />}
                                            <div className={`flex min-w-0 max-w-[min(80%,28rem)] flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                                                {row.messages.map((m, index) => (
                                                    <div
                                                        key={m.id}
                                                        className={`max-w-full rounded-2xl px-3 py-1.5 ${mine ? 'rounded-tr-sm bg-primary-soft' : 'rounded-tl-sm border border-border bg-surface-2'
                                                            }`}
                                                    >
                                                        {!mine && index === 0 ? (
                                                            <span className="block text-xs leading-tight font-semibold text-primary">{row.senderName}</span>
                                                        ) : null}
                                                        {m.deleted ? (
                                                            <div className="flex flex-wrap items-end gap-x-3">
                                                                <p className="text-sm text-muted italic">Сообщение удалено</p>
                                                                <span className="tabular ml-auto shrink-0 text-[11px] leading-none text-muted" title={formatFull(m.createdAt)}>
                                                                    {formatTime(m.createdAt)}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-wrap items-end gap-x-3">
                                                                <div className="min-w-0 text-[15px] leading-snug break-words [&_*]:!leading-snug [&_ol]:!my-1 [&_p]:!my-0 [&_p]:!text-[15px] [&_ul]:!my-1">
                                                                    <AnnouncementBody item={{ body: m.body ?? '', bodyHtml: m.bodyHtml }} />
                                                                </div>
                                                                <span className="tabular ml-auto shrink-0 text-[11px] leading-none text-muted" title={formatFull(m.createdAt)}>
                                                                    {formatTime(m.createdAt)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <footer className="border-t border-border p-3">
                            {error ? <p role="alert" className="mb-2 text-sm text-danger">{error}</p> : null}
                            {/* Поле ввода растёт по строкам; кнопка отправки — квадрат в правом нижнем углу */}
                            <div className="relative rounded-lg border border-border bg-surface focus-within:border-primary">
                                <textarea
                                    ref={input}
                                    value={text}
                                    rows={1}
                                    maxLength={2000}
                                    placeholder="Сообщение"
                                    aria-label="Сообщение"
                                    className="block max-h-[40vh] min-h-11 w-full resize-none overflow-y-auto bg-transparent py-2.5 pr-14 pl-3 outline-none"
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={onKey}
                                />
                                <button
                                    type="button"
                                    aria-label="Отправить"
                                    title="Отправить (Enter)"
                                    disabled={!text.trim() || sending}
                                    onClick={() => void submit()}
                                    className="absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-md bg-primary text-on-primary transition-opacity disabled:opacity-40"
                                >
                                    <Send size={16} aria-hidden="true" />
                                </button>
                            </div>
                        </footer>
                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
                        <MessageCircle size={40} aria-hidden="true" />
                        <p>Выберите беседу</p>
                    </div>
                )}
            </section>
        </div>
    );
}