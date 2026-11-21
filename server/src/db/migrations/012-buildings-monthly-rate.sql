-- Миграция 012: стоимость проживания в здании
-- monthly_rate — плата за одно место (койку) в месяц в рублях.
-- Служит значением по умолчанию для договоров здания;
-- конкретный договор хранит собственную ставку (contracts.monthly_rate).
-- Таблица buildings на момент миграции пуста, поэтому столбец сразу NOT NULL.
-- Если в таблице уже есть строки, миграция завершится ошибкой и будет отменена.

ALTER TABLE buildings
  ADD COLUMN monthly_rate numeric(12, 2) NOT NULL
  CONSTRAINT buildings_monthly_rate_check CHECK (monthly_rate >= 0);