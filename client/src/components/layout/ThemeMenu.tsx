import { Check, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider';
import { ACCENTS, ACCENT_LABELS, ACCENT_SWATCH, FONT_SIZES, MODES, MODE_LABELS, type FontSize } from '../../theme/theme';
import { MODE_ICONS, SIZE_LABELS } from '../ThemeSwitcher';
import { HEADER_ICON_BUTTON, MENU_ITEM, MENU_LABEL, MENU_PANEL } from './menuStyles';

/** Кнопка «Внешний вид»: меню в том же стиле, что и меню пользователя — режим, цвет, размер текста */
export function ThemeMenu() {
  const { mode, setMode, accent, setAccent, fontSize, setFontSize } = useTheme();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Меню закрывается щелчком вне его и клавишей Esc
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Внешний вид"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Внешний вид"
        className={HEADER_ICON_BUTTON}
      >
        <Palette size={20} aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Внешний вид" className={MENU_PANEL}>
          <div>
            <p className={MENU_LABEL}>Режим</p>
            {MODES.map((item) => {
              const Icon = MODE_ICONS[item];
              const active = mode === item;
              return (
                <button
                  key={item}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => setMode(item)}
                  className={`${MENU_ITEM} ${active ? 'bg-primary-soft text-primary hover:bg-primary-soft' : ''}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="flex-1 text-left">{MODE_LABELS[item]}</span>
                  {active ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t border-border pt-2">
            <p className={MENU_LABEL}>Цвет</p>
            <div
              role="radiogroup"
              aria-label="Цвет акцента"
              className="grid grid-cols-5 justify-items-center gap-2 px-3 pt-1 pb-2"
            >
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
                  className={`size-7 rounded-full ring-offset-2 ring-offset-surface transition-shadow ${
                    accent === item ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-1 border-t border-border pt-2">
            <p className={MENU_LABEL}>
              Размер текста
              <span className="tracking-normal normal-case">{SIZE_LABELS[fontSize - 1]}</span>
            </p>
            <div className="px-3 pt-1 pb-2">
              <input
                type="range"
                min={FONT_SIZES[0]}
                max={FONT_SIZES[FONT_SIZES.length - 1]}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value) as FontSize)}
                aria-label="Размер текста"
                aria-valuetext={SIZE_LABELS[fontSize - 1]}
                className="font-size-range w-full"
              />
              <div className="mt-1 flex justify-between text-muted" aria-hidden="true">
                <span className="text-xs">A</span>
                <span className="text-lg leading-none">A</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
