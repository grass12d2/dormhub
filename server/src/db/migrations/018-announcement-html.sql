-- Миграция 018: форматированный текст объявлений
-- body_html хранит очищенный HTML (разрешённый набор тегов, без атрибутов);
-- body остаётся простым текстом для предпросмотра и поиска.
-- У прежних объявлений body_html пуст: показывается простой текст.

ALTER TABLE announcements
  ADD COLUMN body_html text,
  ADD CONSTRAINT announcements_body_html_check
    CHECK (body_html IS NULL OR char_length(body_html) <= 20000);