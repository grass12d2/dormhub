-- Миграция 017: объявления администрации
-- announcements: само объявление; author_id остаётся пустым, если автор удалён.
-- announcement_targets: адресаты. Нет ни одной строки = объявление для всех.
--   Допустимы три вида адреса:
--     только здание;
--     здание и этаж;
--     комната (здание определяется комнатой).
-- announcement_reads: отметки «прочитано» по пользователям.

CREATE TABLE announcements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  body       text NOT NULL,
  author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT announcements_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000)
);

CREATE TABLE announcement_targets (
  id              bigserial PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  building_id     uuid REFERENCES buildings (id) ON DELETE CASCADE,
  floor           integer,
  room_id         uuid REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT announcement_targets_shape_check CHECK (
    (room_id IS NOT NULL AND building_id IS NULL AND floor IS NULL)
    OR (room_id IS NULL AND building_id IS NOT NULL)
  ),
  CONSTRAINT announcement_targets_floor_check CHECK (floor IS NULL OR floor >= 2)
);

CREATE INDEX idx_announcement_targets_announcement ON announcement_targets (announcement_id);

CREATE TABLE announcement_reads (
  announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);