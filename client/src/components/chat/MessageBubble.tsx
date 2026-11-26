import { Pencil } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { downloadChatFile, fetchChatImageUrl, type ChatMessage, type ReactionKind } from '../../api/chat';
import { messageCopyText } from '../../lib/chatCopy';
import { formatFull, formatTime } from '../../lib/chatLayout';
import { FILE_MARKER, emojiOnlyCount } from '../../lib/emoji';
import { FileList } from '../ui/FileList';
import { AnnouncementBody } from '../ui/RichText';
import { MessageMenu, REACTION_EMOJI } from './MessageMenu';

/** Размер эмодзи без текста: чем меньше эмодзи, тем крупнее */
const EMOJI_SIZE: Record<number, string> = { 1: 'text-6xl', 2: 'text-5xl', 3: 'text-4xl', 4: 'text-3xl', 5: 'text-3xl' };

const TEXT_CLASS =
  'chat-content chat-text min-w-0 text-[0.9375rem] leading-snug break-words [&_*]:!leading-snug [&_p]:!my-0 [&_p]:!text-[0.9375rem]';

interface Props {
  message: ChatMessage;
  mine: boolean;
  chatId: number;
  /** Имя отправителя над первым сообщением группы (у своих сообщений null) */
  name: string | null;
  /** В личной переписке число реакций не показывается */
  showCount: boolean;
  canDelete: boolean;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, kind: ReactionKind | null) => void;
  onDelete: (m: ChatMessage) => void;
  /** Правка своего сообщения; без обработчика пункта «Изменить» нет */
  onEdit?: (m: ChatMessage) => void;
}

export function MessageBubble({ message: m, mine, chatId, name, showCount, canDelete, onReply, onReact, onDelete, onEdit }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<number | undefined>(undefined);

  const copy = () => {
    // Только текст сообщения (без времени); таблицы — в виде Markdown, вложение без текста — пустая строка
    const text = m.body === FILE_MARKER ? '' : messageCopyText(m.body, m.bodyHtml);
    void navigator.clipboard?.writeText(text);
  };

  const time = (
    // Время не выделяется и не попадает в буфер при копировании выделенного текста
    // У изменённого сообщения перед временем — карандаш, подсказка показывает время правки
    <span
      data-nocopy=""
      className="tabular ml-auto inline-flex shrink-0 items-center gap-1 text-[0.6875rem] leading-none text-muted select-none"
      title={m.editedAt ? `${formatFull(m.createdAt)}\nИзменено: ${formatFull(m.editedAt)}` : formatFull(m.createdAt)}
    >
      {m.editedAt ? <Pencil size={11} aria-label="Изменено" className="shrink-0" /> : null}
      {formatTime(m.createdAt)}
    </span>
  );
  const nameLine = name ? <span className="mb-1 block text-xs leading-tight font-semibold text-primary">{name}</span> : null;
  const hasFiles = m.files.length > 0;
  const onlyMarker = m.body === FILE_MARKER && hasFiles;
  const emoji = !hasFiles ? emojiOnlyCount(m.body ?? '') : 0;

  const reactionEntries = Object.entries(m.reactions) as Array<[ReactionKind, number]>;
  const hasReactions = reactionEntries.length > 0;

  // Нижняя строка: реакции слева, время всегда справа внизу
  const bottomRow = (
    <div className="mt-1 flex items-end gap-2">
      {hasReactions ? (
        <div data-nocopy="" className="flex flex-1 flex-wrap gap-1 select-none">
          {reactionEntries.map(([kind, count]) => (
            <button
              key={kind}
              type="button"
              className={`chat-text flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${m.myReaction === kind ? 'border-primary bg-primary-soft' : 'border-border bg-surface'
                }`}
              onClick={() => onReact(m, m.myReaction === kind ? null : kind)}
            >
              <span>{REACTION_EMOJI[kind]}</span>
              {showCount ? <span className="tabular">{count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {time}
    </div>
  );

  const quote = m.replyTo ? (
    <div className="mb-1 rounded-md border-l-2 border-primary bg-black/5 px-2 py-0.5 text-xs">
      <span className="block font-semibold text-primary">{m.replyTo.senderName}</span>
      <span className="line-clamp-2 text-muted">{m.replyTo.text ?? 'Сообщение недоступно'}</span>
    </div>
  ) : null;

  const wrap = (children: ReactNode) => (
    <div
      className="relative max-w-full"
      // Правая кнопка мыши открывает меню сообщения
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      // Телефон: долгое нажатие открывает то же меню
      onTouchStart={(e) => {
        const t = e.touches[0];
        press.current = window.setTimeout(() => setMenu({ x: t.clientX, y: t.clientY }), 500);
      }}
      onTouchEnd={() => window.clearTimeout(press.current)}
      onTouchMove={() => window.clearTimeout(press.current)}
    >
      {children}
      {menu ? (
        <MessageMenu
          x={menu.x}
          y={menu.y}
          mine={canDelete}
          current={m.myReaction}
          onReact={(kind) => onReact(m, kind)}
          onCopy={copy}
          onReply={() => onReply(m)}
          onEdit={mine && onEdit && !onlyMarker ? () => onEdit(m) : undefined}
          onDelete={() => onDelete(m)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );

  if (emoji > 0) {
    return wrap(
      <div className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
        {nameLine}
        {quote}
        <div className={`${EMOJI_SIZE[emoji]} chat-text leading-tight`}>{m.body}</div>
        <div className="w-full">{bottomRow}</div>
      </div>
    );
  }

  const textBlock = (
    <div className={TEXT_CLASS}>
      <AnnouncementBody item={{ body: m.body ?? '', bodyHtml: m.bodyHtml }} />
    </div>
  );

  return wrap(
    <div
      className={`max-w-full rounded-2xl px-3 py-1.5 ${mine ? 'rounded-tr-sm bg-primary-soft' : 'rounded-tl-sm border border-border bg-surface-2'
        }`}
    >
      {nameLine}
      {quote}
      {onlyMarker ? null : !hasFiles && !hasReactions ? (
        // Короткое сообщение без вложений и реакций: время в одной строке с текстом
        <div className="flex flex-wrap items-end gap-x-3">
          {textBlock}
          {time}
        </div>
      ) : (
        textBlock
      )}
      {hasFiles ? (
        // Пузырь подстраивается под изображения: ширина по их размерам, не больше 24rem и 70% экрана
        <div className={`${onlyMarker ? '' : 'mt-1.5'} max-w-[min(24rem,70vw)]`}>
          <FileList
            fitWidth="24rem"
            announcementId={`chat-${chatId}-${m.id}`}
            files={m.files}
            loadImage={(fileId) => fetchChatImageUrl(chatId, m.id, fileId)}
            onDownload={(f) => downloadChatFile(chatId, m.id, { ...f, expired: false })}
          />
        </div>
      ) : null}
      {hasFiles || hasReactions ? bottomRow : null}
    </div>
  );
}