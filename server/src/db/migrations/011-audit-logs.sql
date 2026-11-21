-- Миграция 011: журнал аудита
-- Журнал только дописывается: UPDATE, DELETE и TRUNCATE запрещены.
-- Единственное допустимое изменение — обнуление автора (actor_user_id → NULL),
-- которое выполняет внешний ключ ON DELETE SET NULL при удалении пользователя.
-- Без этого исключения удалить пользователя, у которого есть записи в журнале,
-- было бы невозможно.

CREATE OR REPLACE FUNCTION audit_logs_guard()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Журнал аудита неизменяем: операция % запрещена', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE audit_logs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL CHECK (btrim(action) <> ''),
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION audit_logs_guard();

CREATE TRIGGER audit_logs_truncate_protection
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION audit_logs_guard();

CREATE INDEX idx_audit_logs_actor_user_id_created_at
  ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity_type_entity_id ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);