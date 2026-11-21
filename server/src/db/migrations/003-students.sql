-- Миграция 003: студенты
-- Профиль студента, необязательно связанный с учётной записью.
-- Составной внешний ключ (user_id, user_role) гарантирует, что к студенту
-- можно привязать только пользователя с ролью student.
-- Номер студенческого: ровно 7 цифр, хранится как текст
-- (1–2: год поступления, 3–4: год окончания, 5–7: порядковый номер).

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  user_role text GENERATED ALWAYS AS ('student') STORED,
  student_number text NOT NULL UNIQUE
    CONSTRAINT students_student_number_format CHECK (student_number ~ '^[0-9]{7}$'),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  last_name text CHECK (last_name IS NULL OR btrim(last_name) <> ''),
  first_name text CHECK (first_name IS NULL OR btrim(first_name) <> ''),
  middle_name text CHECK (middle_name IS NULL OR btrim(middle_name) <> ''),
  birth_date date NOT NULL,
  phone text,
  faculty text,
  group_name text,
  education_level text,
  field_of_study text,
  program_code text,
  specialization text,
  study_year smallint CHECK (study_year > 0),
  funding_type text CHECK (funding_type IN ('budget', 'paid', 'scholarship')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, user_role) REFERENCES users (id, role)
    MATCH SIMPLE ON DELETE RESTRICT
);

CREATE TRIGGER students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Поиск по началу ФИО без учёта регистра
CREATE INDEX idx_students_display_name_pattern
  ON students (lower(display_name) text_pattern_ops);