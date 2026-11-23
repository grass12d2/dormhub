-- Миграция 015: одноразовые коды восстановления пароля
-- В базе хранится только HMAC кода (64 символа hex), сам код не сохраняется.
-- Не более 5 неверных попыток; у пользователя одновременно один действующий код.

CREATE TABLE password_reset_codes (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   smallint NOT NULL DEFAULT 0,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_codes_hash_check CHECK (char_length(code_hash) = 64),
  CONSTRAINT password_reset_codes_attempts_check CHECK (attempts BETWEEN 0 AND 5)
);

CREATE UNIQUE INDEX idx_password_reset_one_active
  ON password_reset_codes (user_id) WHERE used_at IS NULL;