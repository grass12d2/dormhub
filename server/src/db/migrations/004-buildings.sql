-- Миграция 004: здания общежития
-- building_number уникален (изначально 1–6, затем могут добавляться новые).
-- Типы здания: corridor (коридорный), block (блочный), apartment (квартирный).
-- Руководящий состав здания хранится в отдельной таблице building_staff.

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_number smallint NOT NULL UNIQUE CHECK (building_number > 0),
  address text NOT NULL CHECK (btrim(address) <> ''),
  metro_station text CHECK (metro_station IS NULL OR btrim(metro_station) <> ''),
  building_type text NOT NULL CHECK (building_type IN ('corridor', 'block', 'apartment')),
  floors_count smallint NOT NULL CHECK (floors_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER buildings_updated_at
BEFORE UPDATE ON buildings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();