// Применяет сохранённую тему до первой отрисовки страницы.
// Ключ хранилища и список цветов совпадают с src/theme/theme.ts
// (совпадение проверяет тест tests/theme.test.ts).
(function () {
  var root = document.documentElement;
  var ACCENTS = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'amber', 'green', 'teal', 'cyan'];
  var SCALE = { 1: 90, 2: 95, 3: 100, 4: 108, 5: 116 };
  var accent = 'blue';
  var mode = 'system';
  var fontSize = 3;
  try {
    var saved = JSON.parse(localStorage.getItem('dormhub.theme') || '{}');
    if (ACCENTS.indexOf(saved.accent) >= 0) accent = saved.accent;
    if (['light', 'dark', 'pastel', 'system'].indexOf(saved.mode) >= 0) mode = saved.mode;
    if (SCALE[saved.fontSize]) fontSize = saved.fontSize;
  } catch (e) {
    // Повреждённое значение: остаются настройки по умолчанию
  }
  var theme = mode;
  if (mode === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', accent);
  root.style.fontSize = SCALE[fontSize] + '%';
})();