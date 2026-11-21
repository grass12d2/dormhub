-- Миграция 009: счета
-- Счёт относится к договору. Статусы: unpaid, partially_paid, paid, cancelled.
-- Просрочка не хранится: её определяют по сроку оплаты и состоянию платежей.
-- Статус обновляет сервис в транзакции при записи платежа.

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number bigint NOT NULL UNIQUE GENERATED ALWAYS AS IDENTITY,
  contract_id uuid NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (btrim(description) <> ''),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_dates_check CHECK (due_date >= issue_date)
);

CREATE TRIGGER invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_invoices_contract_id ON invoices (contract_id);
CREATE INDEX idx_invoices_status_due_date ON invoices (status, due_date);