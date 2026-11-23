-- Миграция 014: профили учётных записей и аватары
-- user_profiles: дополнительные данные любой учётной записи (администратора или студента).
-- user_avatars: изображение хранится в базе данных; размер ограничен 2 МБ,
-- формат проверяет сервер по сигнатуре файла, база проверяет допустимый тип.

CREATE TABLE user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name text,
  phone        text,
  job_title    text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_display_name_check
    CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT user_profiles_phone_check
    CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 30),
  CONSTRAINT user_profiles_job_title_check
    CHECK (job_title IS NULL OR char_length(btrim(job_title)) BETWEEN 1 AND 200)
);

CREATE TABLE user_avatars (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  content_type text  NOT NULL,
  data         bytea NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_avatars_content_type_check
    CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT user_avatars_size_check
    CHECK (octet_length(data) BETWEEN 1 AND 2097152)
);