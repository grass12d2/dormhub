-- Миграция 020: чат
-- kind: floor (все жильцы этажа здания), block (жильцы блока на этаже блочного здания),
-- direct (личная переписка двух пользователей).
-- Групповые чаты создаются по требованию; ключ уникален.
-- Для личных чатов пара хранится упорядоченной (user_a < user_b): одна пара — один чат.

CREATE TABLE chats (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  building_id uuid REFERENCES buildings (id) ON DELETE CASCADE,
  floor       integer,
  block       integer,
  user_a      uuid REFERENCES users (id) ON DELETE CASCADE,
  user_b      uuid REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chats_kind_check CHECK (kind IN ('floor', 'block', 'direct')),
  CONSTRAINT chats_shape_check CHECK (
    (kind = 'floor' AND building_id IS NOT NULL AND floor IS NOT NULL AND floor >= 2
       AND block IS NULL AND user_a IS NULL AND user_b IS NULL)
    OR (kind = 'block' AND building_id IS NOT NULL AND floor IS NOT NULL AND floor >= 2
       AND block IS NOT NULL AND block >= 1 AND user_a IS NULL AND user_b IS NULL)
    OR (kind = 'direct' AND user_a IS NOT NULL AND user_b IS NOT NULL AND user_a < user_b
       AND building_id IS NULL AND floor IS NULL AND block IS NULL)
  )
);

CREATE UNIQUE INDEX idx_chats_floor ON chats (building_id, floor) WHERE kind = 'floor';
CREATE UNIQUE INDEX idx_chats_block ON chats (building_id, floor, block) WHERE kind = 'block';
CREATE UNIQUE INDEX idx_chats_direct ON chats (user_a, user_b) WHERE kind = 'direct';

CREATE TABLE chat_messages (
  id         bigserial PRIMARY KEY,
  chat_id    bigint NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  sender_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chat_messages_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX idx_chat_messages_chat ON chat_messages (chat_id, id);

CREATE TABLE chat_reads (
  chat_id              bigint NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_message_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);