-- Миграция 007: койки
-- Статусы: available (доступна), maintenance (на обслуживании).
-- Койку на обслуживании нельзя назначить студенту — это проверяет сервис.
-- Число коек в комнате не может превышать вместимость комнаты —
-- это правило проверяет сервис в транзакции с блокировкой комнаты.

CREATE TABLE beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE RESTRICT,
  bed_number smallint NOT NULL CHECK (bed_number > 0),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, bed_number)
);

CREATE TRIGGER beds_updated_at
BEFORE UPDATE ON beds
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();