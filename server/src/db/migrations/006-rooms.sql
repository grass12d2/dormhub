-- Миграция 006: комнаты
-- Первый этаж имеет номер 1. Соответствие этажа количеству этажей здания
-- (floor <= buildings.floors_count) проверяет сервис в транзакции:
-- CHECK не может читать другую таблицу.
-- Вместимость 2–4 — проектная максимальная, а не текущее число жильцов.

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE RESTRICT,
  room_number text NOT NULL CHECK (btrim(room_number) <> ''),
  floor smallint NOT NULL CHECK (floor >= 1),
  capacity smallint NOT NULL CHECK (capacity BETWEEN 2 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, room_number)
);

CREATE TRIGGER rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();