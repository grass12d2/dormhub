-- Миграция 010: платежи
-- Платежи — неизменяемые финансовые записи: UPDATE, DELETE и TRUNCATE запрещены
-- на уровне базы данных. Исправление ошибки оформляется отдельной записью.
-- Сумма платежей по счёту не должна превышать сумму счёта — это правило
-- проверяет сервис в транзакции с блокировкой счёта.

CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Таблица % неизменяема: операция % запрещена', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer')),
  reference text,
  recorded_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER payments_immutable
BEFORE UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER payments_truncate_protection
BEFORE TRUNCATE ON payments
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_modification();

CREATE INDEX idx_payments_invoice_id ON payments (invoice_id);