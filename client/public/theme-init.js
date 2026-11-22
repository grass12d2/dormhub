// Применяет сохранённую тему до первой отрисовки страницы.
// Ключ хранилища и список цветов совпадают с src/theme/theme.ts
// (совпадение проверяет тест tests/theme.test.ts).
(function () {
  var root = document.documentElement;
  var ACCENTS = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'green', 'teal', 'cyan'];
  var accent = 'blue';
  var mode = 'system';
  try {
    var saved = JSON.parse(localStorage.getItem('dormhub.theme') || '{}');
    if (ACCENTS.indexOf(saved.accent) >= 0) accent = saved.accent;
    if (saved.mode === 'light' || saved.mode === 'dark' || saved.mode === 'system') mode = saved.mode;
  } catch (e) {
    // Повреждённое значение: остаются настройки по умолчанию
  }
  var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-accent', accent);
})();