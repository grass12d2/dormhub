-- Миграция 001: расширения и вспомогательные функции
-- btree_gist нужен для GiST-ограничения на пересечение договоров по койке.
-- set_updated_at автоматически обновляет поле updated_at при изменении строки.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;