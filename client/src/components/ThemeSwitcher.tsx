import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
    ACCENTS,
    ACCENT_LABELS,
    ACCENT_SWATCH,
    FONT_SIZES,
    MODES,
    MODE_LABELS,
    type FontSize,
} from '../theme/theme';

/** Значок режима: солнце, луна, палитра (пастельная), монитор (система) */
export const MODE_ICONS = { light: Sun, dark: Moon, pastel: Palette, system: Monitor } as const;

/** Подписи уровней размера текста */
export const SIZE_LABELS = ['Очень мелкий', 'Мелкий', 'Обычный', 'Крупный', 'Очень крупный'];

/** Блок настроек с заголовком; bare — без рамки, фона и отступов (панель в шапке) */
function Block({
    title,
    extra,
    bare = false,
    children,
}: {
    title: string;
    extra?: string;
    bare?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={bare ? '' : 'rounded-xl border border-border bg-surface p-5'}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
                {extra ? <span className="text-xs text-muted">{extra}</span> : null}
            </div>
            {children}
        </section>
    );
}

/**
 * Выбор режима. Компактный вариант (панель в шапке) всегда 2×2;
 * обычный вариант (страница настроек) подстраивается под ширину экрана.
 */
export function ModeBlock({ compact = false }: { compact?: boolean }) {
    const { mode, setMode } = useTheme();
    const columns = compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-2';
    return (
        <Block title="Режим" bare={compact}>
            <div role="radiogroup" aria-label="Режим темы" className={`grid gap-2 ${columns}`}>
                {MODES.map((item) => {
                    const Icon = MODE_ICONS[item];
                    return (
                        <button
                            key={item}
                            type="button"
                            role="radio"
                            aria-checked={mode === item}
                            onClick={() => setMode(item)}
                            className={`flex h-10 items-center justify-start gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${mode === item
                                ? 'border-primary bg-primary-soft text-primary'
                                : 'border-border bg-surface text-fg hover:bg-surface-2'
                                }`}
                        >
                            <Icon size={16} aria-hidden="true" />
                            {MODE_LABELS[item]}
                        </button>
                    );
                })}
            </div>
        </Block>
    );
}

/** Выбор цвета: десять кружков в два ряда по пять, плотно по ширине блока */
export function AccentBlock({ bare = false }: { bare?: boolean }) {
    const { accent, setAccent } = useTheme();
    return (
        <Block title="Цвет" bare={bare}>
            <div
                role="radiogroup"
                aria-label="Цвет акцента"
                className="grid grid-cols-5 justify-items-center gap-3"
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
                        className={`size-9 rounded-full ring-offset-2 ring-offset-surface transition-shadow ${accent === item ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border'
                            }`}
                    />
                ))}
            </div>
        </Block>
    );
}

/** Размер текста: ползунок на всю ширину блока, без рамки вокруг */
export function FontSizeBlock({ bare = false }: { bare?: boolean }) {
    const { fontSize, setFontSize } = useTheme();
    return (
        <Block title="Размер текста" extra={SIZE_LABELS[fontSize - 1]} bare={bare}>
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
            <div className="mt-2 flex justify-between text-muted" aria-hidden="true">
                <span className="text-xs">A</span>
                <span className="text-xl leading-none">A</span>
            </div>
        </Block>
    );
}

/** Все три блока подряд (для выпадающей панели в шапке) */
export function ThemeSwitcher() {
    return (
        <div className="flex w-full flex-col gap-5">
            <ModeBlock compact />
            <AccentBlock bare />
            <FontSizeBlock bare />
        </div>
    );
}