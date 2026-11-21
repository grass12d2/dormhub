-- Миграция 005: сотрудники зданий
-- Должность хранится как произвольный русский текст.
-- Удаление здания, у которого есть сотрудники, запрещено (RESTRICT).

CREATE TABLE building_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings (id) ON DELETE RESTRICT,
  job_title text NOT NULL CHECK (btrim(job_title) <> ''),
  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER building_staff_updated_at
BEFORE UPDATE ON building_staff
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_building_staff_building_id ON building_staff (building_id);