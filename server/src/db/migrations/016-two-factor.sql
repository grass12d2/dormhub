-- Миграция 016: двухфакторная аутентификация (TOTP)
-- Секрет хранится в зашифрованном виде (AES-256-GCM, base64).
-- last_step запрещает повторное использование одного и того же кода.
-- Коды восстановления хранятся только как хеши и используются один раз.

CREATE TABLE user_two_factor (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  secret_enc text NOT NULL,
  enabled    boolean NOT NULL DEFAULT false,
  last_step  bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  enabled_at timestamptz,
  CONSTRAINT user_two_factor_secret_check CHECK (char_length(secret_enc) BETWEEN 1 AND 500)
);

CREATE TABLE two_factor_recovery_codes (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at   timestamptz,
  CONSTRAINT two_factor_recovery_hash_check CHECK (char_length(code_hash) = 64),
  CONSTRAINT two_factor_recovery_unique UNIQUE (user_id, code_hash)
);