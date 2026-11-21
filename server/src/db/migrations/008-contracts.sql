-- Миграция 008: договоры проживания
-- Договоры срочные: end_date обязательна. Период — полуинтервал [start_date, end_date).
-- Статусы pending и active считаются «живыми»:
--   * GiST-ограничение запрещает пересечение живых договоров на одну койку;
--   * частичный уникальный индекс допускает не более одного живого договора на студента.

CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  bed_id uuid NOT NULL REFERENCES beds (id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  monthly_rate numeric(12, 2) NOT NULL CHECK (monthly_rate >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'terminated', 'expired', 'cancelled')),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  terminated_at timestamptz,
  termination_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contracts_dates_check CHECK (end_date > start_date),
  CONSTRAINT contracts_terminated_consistency
    CHECK ((status = 'terminated') = (terminated_at IS NOT NULL)),
  CONSTRAINT contracts_bed_no_overlap EXCLUDE USING gist (
    bed_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (status IN ('pending', 'active'))
);

CREATE TRIGGER contracts_updated_at
BEFORE UPDATE ON contracts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_contracts_student_id ON contracts (student_id);
CREATE INDEX idx_contracts_bed_id ON contracts (bed_id);
CREATE INDEX idx_contracts_status ON contracts (status);
CREATE UNIQUE INDEX idx_contracts_one_live
  ON contracts (student_id) WHERE status IN ('pending', 'active');