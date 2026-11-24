-- Миграция 021: расширение чата
-- body_html: форматированный текст (очищается на сервере), body остаётся простым текстом.
-- reply_to_id: ответ на сообщение.
-- chat_message_files: вложения до 10 МБ; через 7 дней содержимое удаляется (data = NULL,
--   expired_at заполняется), имя и размер остаются для показа «файл истёк».
-- chat_reactions: одна реакция пользователя на сообщение, шесть видов.
-- chat_blocks: блокировка собеседника в личной переписке.

ALTER TABLE chat_messages
  ADD COLUMN body_html text,
  ADD COLUMN reply_to_id bigint REFERENCES chat_messages (id) ON DELETE SET NULL,
  ADD CONSTRAINT chat_messages_html_check CHECK (body_html IS NULL OR char_length(body_html) <= 20000);

CREATE TABLE chat_message_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   bigint NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  content_type text NOT NULL,
  size_bytes   integer NOT NULL,
  data         bytea,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expired_at   timestamptz,
  CONSTRAINT chat_files_name_check CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT chat_files_type_check CHECK (content_type IN (
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  CONSTRAINT chat_files_size_check CHECK (size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT chat_files_data_check CHECK (
    (data IS NOT NULL AND expired_at IS NULL AND size_bytes = octet_length(data))
    OR (data IS NULL AND expired_at IS NOT NULL)
  )
);

CREATE INDEX idx_chat_files_message ON chat_message_files (message_id);
CREATE INDEX idx_chat_files_live ON chat_message_files (created_at) WHERE data IS NOT NULL;

CREATE TABLE chat_reactions (
  message_id bigint NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT chat_reactions_kind_check CHECK (kind IN ('like', 'love', 'haha', 'wow', 'sad', 'angry'))
);

CREATE TABLE chat_blocks (
  blocker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chat_blocks_self_check CHECK (blocker_id <> blocked_id)
);