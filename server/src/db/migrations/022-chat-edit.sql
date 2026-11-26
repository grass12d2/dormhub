-- Миграция 022: редактирование сообщений чата
-- edited_at: время последней правки (NULL — сообщение не изменялось); в ленте показывается значок карандаша.

ALTER TABLE chat_messages ADD COLUMN edited_at timestamptz;
