import { MessageCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { listChats } from '../../api/chat';
import { useAuth } from '../../auth/AuthProvider';
import { isMuted } from '../../lib/chatMute';
import { readNotifyPrefs } from '../../lib/notifyPrefs';
import { useChatUnread } from '../../lib/useChatUnread';

/** Небольшое окно под шапкой по центру: пришло новое сообщение (не из беседы с отключёнными уведомлениями) */
export function ChatToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  path.current = pathname;
  const [visible, setVisible] = useState(false);

  useChatUnread(() => {
    if (!readNotifyPrefs().chat || path.current === '/chat') return;
    listChats().then(
      (all) => {
        if (all.some((c) => c.unread > 0 && !isMuted(c.id))) setVisible(true);
      },
      () => undefined
    );
  });

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (pathname === '/chat') setVisible(false);
  }, [pathname]);

  if (!user || !visible) return null;
  return (
    <div
      role="status"
      className="animate-pop-in fixed top-20 left-1/2 z-[70] flex w-[80vw] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-pop md:w-auto md:min-w-80"
    >
      <MessageCircle size={18} aria-hidden="true" className="shrink-0 text-primary" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm font-medium"
        onClick={() => {
          setVisible(false);
          navigate('/chat');
        }}
      >
        Новое сообщение в чате
      </button>
      <button type="button" aria-label="Закрыть" className="rounded-md p-1 text-muted hover:bg-surface-2" onClick={() => setVisible(false)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}