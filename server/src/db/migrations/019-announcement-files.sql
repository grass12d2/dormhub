-- Миграция 019: вложения объявлений
-- Файл хранится в базе (bytea), не более 5 МБ; тип проверяет сервер по сигнатуре,
-- база проверяет допустимый MIME-тип. Не более 5 файлов на объявление контролирует сервис.

CREATE TABLE announcement_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  content_type    text NOT NULL,
  size_bytes      integer NOT NULL,
  data            bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_files_name_check CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT announcement_files_type_check CHECK (content_type IN (
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  CONSTRAINT announcement_files_size_check CHECK (
    size_bytes BETWEEN 1 AND 5242880 AND size_bytes = octet_length(data)
  )
);

CREATE INDEX idx_announcement_files_announcement ON announcement_files (announcement_id);