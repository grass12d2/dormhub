import { ArrowLeft, CheckCheck, GraduationCap, MessageCircle, Plus, Search, ShieldCheck, Users, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
    CHAT_EVENT,
    blockUser,
    deleteChatMessage,
    listChats,
    listMembers,
    listMessages,
    markAllChatsRead,
    markChatRead,
    openDirectChat,
    searchPeople,
    editMessage,
    sendMessage,
    setReaction,
    unblockUser,
    uploadChatFile,
    type ChatMember,
    type ChatMessage,
    type ChatPerson,
    type ChatSummary,
    type ReactionKind,
} from '../api/chat';
import { useAuth } from '../auth/AuthProvider';
import { ChatComposer } from '../components/chat/ChatComposer';
import { ChatMenu } from '../components/chat/ChatMenu';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ProfileCard } from '../components/chat/ProfileCard';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CountBadge } from '../components/ui/CountBadge';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { UserAvatar } from '../components/ui/UserAvatar';
import { nodeToText } from '../lib/chatCopy';
import { buildRows, formatTime, mergeMessages, syncLatest } from '../lib/chatLayout';
import { isMuted, muteChat, unmuteChat } from '../lib/chatMute';
import { FILE_MARKER } from '../lib/emoji';
import { useAsync } from '../lib/useAsync';

const PAGE = 50;
const MESSAGES_POLL_MS = 3_000;
const LIST_POLL_MS = 10_000;

/** Значок чата в списке: у личного — аватар собеседника, у группового — иконка; тонкий контур цвета акцента,
 * чтобы значок не сливался с выделенной строкой (у них общий фон primary-soft) */
function ChatIcon({ chat }: { chat: ChatSummary }) {
    return chat.kind === 'direct' ? (
        <UserAvatar userId={chat.otherUserId} name={chat.title} className="size-11" />
    ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary ring-1 ring-primary/35 ring-inset">
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
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [markingAll, setMarkingAll] = useState(false);
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
    /** Редактируемое своё сообщение (взаимоисключается с ответом) */
    const [editing, setEditing] = useState<ChatMessage | null>(null);
    const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmBlock, setConfirmBlock] = useState(false);
    const [blocking, setBlocking] = useState(false);
    const [members, setMembers] = useState<ChatMember[] | null>(null);
    /** Открытая карточка пользователя (по нажатию на аватар) */
    const [profileOf, setProfileOf] = useState<{ userId: string; name: string; anchor: HTMLElement } | null>(null);
    const closeProfile = useCallback(() => setProfileOf(null), []);
    // Карточка привязана к аватару открытой беседы: при смене беседы закрывается
    useEffect(() => setProfileOf(null), [selectedId]);
    const [, setMuteTick] = useState(0);

    // Поиск собеседника для нового сообщения
    const [composing, setComposing] = useState(false);
    const [query, setQuery] = useState('');
    const [people, setPeople] = useState<ChatPerson[]>([]);

    const scroller = useRef<HTMLDivElement>(null);
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
        setReplyTo(null);
        setEditing(null);
        lastRead.current = 0;
        stick.current = true;
        if (selectedId === null) return;
        let cancelled = false;
        let first = true;
        const load = async () => {
            try {
                const fresh = await listMessages(selectedId, { limit: PAGE });
                if (cancelled) return;
                // Удалённые на сервере сообщения исчезают и у собеседника
                setMessages((prev) => syncLatest(prev, fresh, PAGE));
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

    // При открытии страницы и беседы вся страница прокручивается вниз
    useEffect(() => {
        const id = window.setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight }), 50);
        return () => window.clearTimeout(id);
    }, [selectedId]);

    // Прокрутка вниз при новых сообщениях, если читатель у конца ленты
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    // Изображения и вложения загружаются позже и меняют высоту: пока читатель у конца, лента остаётся внизу
    useEffect(() => {
        const el = scroller.current;
        const inner = el?.firstElementChild;
        if (!el || !inner) return;
        const observer = new ResizeObserver(() => {
            if (stick.current) el.scrollTop = el.scrollHeight;
        });
        observer.observe(inner);
        return () => observer.disconnect();
    }, [selectedId, loadingMessages]);

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

    /**
     * Копирование выделенного в ленте: время, даты и реакции не попадают в буфер,
     * таблицы превращаются в Markdown (в HTML-версии остаются таблицами, но без времени)
     */
    const onCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < selection.rangeCount; i += 1) fragment.append(selection.getRangeAt(i).cloneContents());
        fragment.querySelectorAll('[data-nocopy]').forEach((el) => el.remove());
        const holder = document.createElement('div');
        holder.append(fragment.cloneNode(true));
        e.preventDefault();
        e.clipboardData.setData('text/plain', nodeToText(fragment));
        e.clipboardData.setData('text/html', holder.innerHTML);
    };

    const onScroll = () => {
        const el = scroller.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    const refreshMessages = async () => {
        if (selectedId === null) return;
        const fresh = await listMessages(selectedId, { limit: PAGE });
        setMessages((prev) => syncLatest(prev, fresh, PAGE));
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

    /** Отправка из поля ввода: сообщение, затем файлы; true — поле можно очистить */
    const handleSend = async (html: string, plain: string, files: File[]): Promise<boolean> => {
        if (selectedId === null || sending) return false;
        setSending(true);
        setError('');
        try {
            if (editing) {
                await editMessage(selectedId, editing.id, html ? { bodyHtml: html } : { body: plain });
                setEditing(null);
                await refreshMessages();
                return true;
            }
            // Без текста сообщение состоит только из вложений (знак-заполнитель в ленте не показывается)
            const base = html ? { bodyHtml: html } : { body: plain || FILE_MARKER };
            const input = replyTo ? { ...base, replyToId: replyTo.id } : base;
            const { id } = await sendMessage(selectedId, input);
            let uploadFailed = '';
            for (const file of files) {
                try {
                    await uploadChatFile(selectedId, id, file);
                } catch (caught) {
                    uploadFailed = caught instanceof Error ? caught.message : 'Не удалось загрузить файл';
                }
            }
            if (uploadFailed) setError(`Сообщение отправлено, но файл не загружен: ${uploadFailed}`);
            stick.current = true;
            setReplyTo(null);
            await refreshMessages();
            window.dispatchEvent(new Event(CHAT_EVENT));
            return true;
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось отправить сообщение');
            return false;
        } finally {
            setSending(false);
        }
    };

    const handleReact = async (m: ChatMessage, kind: ReactionKind | null) => {
        if (selectedId === null) return;
        try {
            await setReaction(selectedId, m.id, kind);
            await refreshMessages();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось поставить реакцию');
        }
    };

    /** Удаление насовсем у обоих собеседников (после подтверждения) */
    const confirmDelete = async () => {
        if (selectedId === null || !toDelete) return;
        setDeleting(true);
        try {
            await deleteChatMessage(selectedId, toDelete.id);
            setMessages((prev) => prev.filter((m) => m.id !== toDelete.id));
            if (editing?.id === toDelete.id) setEditing(null);
            await refreshMessages();
            window.dispatchEvent(new Event(CHAT_EVENT));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось удалить сообщение');
        } finally {
            setDeleting(false);
            setToDelete(null);
        }
    };

    /** Разблокировка сразу; блокировка — после подтверждения в диалоге */
    const toggleBlock = async (confirmed = false) => {
        if (!selected?.otherUserId) return;
        if (!selected.blockedByMe && !confirmed) {
            setConfirmBlock(true);
            return;
        }
        setBlocking(true);
        try {
            if (selected.blockedByMe) await unblockUser(selected.otherUserId);
            else await blockUser(selected.otherUserId);
            refresh();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось изменить блокировку');
        } finally {
            setBlocking(false);
            setConfirmBlock(false);
        }
    };

    const openMembers = async () => {
        if (selectedId === null) return;
        try {
            setMembers(await listMembers(selectedId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось загрузить участников');
        }
    };

    const markAll = async () => {
        setMarkingAll(true);
        try {
            await markAllChatsRead();
            refresh();
            window.dispatchEvent(new Event(CHAT_EVENT));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Не удалось отметить беседы прочитанными');
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

    /** Аватар-кнопка: открывает карточку пользователя, повторное нажатие закрывает */
    const avatarButton = (userId: string | null, name: string) => {
        if (!userId) return <UserAvatar userId={null} name={name} className="size-9" />;
        const open = (e: ReactMouseEvent<HTMLButtonElement>) => {
            const anchor = e.currentTarget;
            setProfileOf((prev) => (prev?.anchor === anchor ? null : { userId, name, anchor }));
        };
        return (
            <button
                type="button"
                aria-label={`Профиль: ${name}`}
                title={name}
                className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={open}
            >
                <UserAvatar userId={userId} name={name} className="size-9" />
            </button>
        );
    };

    return (
        <div className="sticky top-20 flex h-[calc(100dvh-10rem)] min-h-80 flex-none overflow-hidden rounded-xl border border-border bg-surface md:h-[calc(100dvh-6.5rem)]">
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
                            {/* Высота равна аватару, имя по центру относительно него; в личной переписке под именем — роль собеседника */}
                            <div className="flex h-11 min-w-0 flex-1 flex-col justify-center gap-1">
                                <h2 className="truncate leading-none font-semibold">{selected.title}</h2>
                                {selected.kind === 'direct' && selected.otherRole ? (
                                    selected.otherRole === 'admin' ? (
                                        <p className="flex items-center gap-1 text-xs leading-none text-primary">
                                            <ShieldCheck size={12} aria-hidden="true" /> Администратор
                                        </p>
                                    ) : (
                                        <p className="flex items-center gap-1 text-xs leading-none text-muted">
                                            <GraduationCap size={12} aria-hidden="true" /> Студент
                                        </p>
                                    )
                                ) : null}
                            </div>
                            <ChatMenu
                                muted={isMuted(selected.id)}
                                isGroup={selected.kind !== 'direct'}
                                canBlock={selected.kind === 'direct' && selected.otherRole === 'student'}
                                blockedByMe={selected.blockedByMe}
                                onMute={(ms) => {
                                    muteChat(selected.id, ms);
                                    setMuteTick((n) => n + 1);
                                }}
                                onUnmute={() => {
                                    unmuteChat(selected.id);
                                    setMuteTick((n) => n + 1);
                                }}
                                onMembers={() => void openMembers()}
                                onToggleBlock={() => void toggleBlock()}
                            />
                        </header>

                        <div ref={scroller} onScroll={onScroll} onCopy={onCopy} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            <div>
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
                                                <div key={row.key} data-nocopy="" className="my-2 flex justify-center select-none">
                                                    <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">{row.label}</span>
                                                </div>
                                            );
                                        }
                                        const mine = row.senderId === myId;
                                        return (
                                            <div key={row.key} className={`flex items-start gap-2 ${mine ? 'justify-end' : ''}`}>
                                                {/* Аватар только у чужих сообщений, по верху первого пузыря группы */}
                                                {mine ? null : avatarButton(row.senderId, row.senderName)}
                                                <div className={`flex min-w-0 max-w-[min(80%,28rem)] flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                                                    {row.messages.map((m, index) => (
                                                        <MessageBubble
                                                            key={m.id}
                                                            message={m}
                                                            mine={mine}
                                                            chatId={selected.id}
                                                            name={!mine && index === 0 ? row.senderName : null}
                                                            showCount={selected.kind !== 'direct'}
                                                            canDelete={mine || user?.role === 'admin'}
                                                            onReply={(msg) => {
                                                                setEditing(null);
                                                                setReplyTo(msg);
                                                            }}
                                                            onEdit={(msg) => {
                                                                setReplyTo(null);
                                                                setEditing(msg);
                                                            }}
                                                            onReact={(msg, kind) => void handleReact(msg, kind)}
                                                            onDelete={setToDelete}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <footer className="border-t border-border p-3">
                            {error ? <p role="alert" className="mb-2 text-sm text-danger">{error}</p> : null}
                            {selected.blockedByMe ? (
                                <p className="py-2 text-center text-sm text-muted">Вы заблокировали этого пользователя. Разблокировать можно в меню беседы.</p>
                            ) : selected.blockedMe ? (
                                <p className="py-2 text-center text-sm text-muted">Этот пользователь ограничил переписку с вами.</p>
                            ) : (
                                <ChatComposer
                                    key={selected.id}
                                    sending={sending}
                                    onSend={handleSend}
                                    replyTo={
                                        replyTo
                                            ? {
                                                  id: replyTo.id,
                                                  senderName: replyTo.senderName,
                                                  // Сообщение только с вложениями: вместо значка-заполнителя — понятная подпись
                                                  text: replyTo.body === FILE_MARKER ? 'Вложение' : replyTo.body,
                                              }
                                            : null
                                    }
                                    onCancelReply={() => setReplyTo(null)}
                                    editing={editing ? { id: editing.id, html: editing.bodyHtml, text: editing.body ?? '' } : null}
                                    onCancelEdit={() => setEditing(null)}
                                />
                            )}
                        </footer>
                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
                        <MessageCircle size={40} aria-hidden="true" />
                        <p>Выберите беседу</p>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={toDelete !== null}
                title="Удалить сообщение?"
                message="Сообщение будет удалено у обоих собеседников без возможности восстановления."
                confirmLabel="Удалить"
                danger
                loading={deleting}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setToDelete(null)}
            />

            <ConfirmDialog
                open={confirmBlock}
                title="Заблокировать собеседника?"
                message="Переписка будет закрыта для вас обоих. Разблокировать можно в меню беседы."
                confirmLabel="Заблокировать"
                danger
                loading={blocking}
                onConfirm={() => void toggleBlock(true)}
                onCancel={() => setConfirmBlock(false)}
            />

            <Modal open={members !== null} title="Участники" onClose={() => setMembers(null)}>
                <ul className="flex flex-col gap-1">
                    {(members ?? []).map((p) => (
                        <li key={`${p.userId}-${p.room}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                            {avatarButton(p.userId, p.name)}
                            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                            <span className="tabular shrink-0 text-xs text-muted">комн. {p.room}</span>
                        </li>
                    ))}
                    {members?.length === 0 ? <li className="text-sm text-muted">Участников нет</li> : null}
                </ul>
            </Modal>

            {profileOf ? (
                <ProfileCard
                    key={profileOf.userId}
                    userId={profileOf.userId}
                    name={profileOf.name}
                    anchor={profileOf.anchor}
                    isMe={profileOf.userId === myId}
                    onMessage={(id) => {
                        setMembers(null);
                        void startWith(id);
                    }}
                    onClose={closeProfile}
                />
            ) : null}
        </div>
    );
}