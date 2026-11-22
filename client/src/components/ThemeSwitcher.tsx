import { useTheme } from '../theme/ThemeProvider';
import { ACCENTS, ACCENT_LABELS, ACCENT_SWATCH, MODES, MODE_LABELS } from '../theme/theme';

/** Выбор режима (светлая, тёмная, как в системе) и цвета акцента */
export function ThemeSwitcher() {
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <div className="flex flex-col gap-4">
      {/* Режим темы */}
      <div role="radiogroup" aria-label="Режим темы" className="flex flex-wrap gap-2">
        {MODES.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={mode === item}
            onClick={() => setMode(item)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
              mode === item
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-surface text-fg hover:bg-surface-2'
            }`}
          >
            {MODE_LABELS[item]}
          </button>
        ))}
      </div>
      {/* Цвет акцента */}
      <div role="radiogroup" aria-label="Цвет акцента" className="flex flex-wrap gap-2">
        {ACCENTS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={accent === item}
            aria-label={ACCENT_LABELS[item]}
            title={ACCENT_LABELS[item]}
            onClick={() => setAccent(item)}
            style={{ backgroundColor: ACCENT_SWATCH[item] }}
            className={`size-8 rounded-full ring-offset-2 ring-offset-surface transition-shadow ${
              accent === item ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}