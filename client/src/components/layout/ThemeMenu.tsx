import { Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { Button } from '../ui/Button';

/** Единая кнопка «Внешний вид» с выпадающей панелью настроек темы */
export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Панель закрывается щелчком вне её и клавишей Esc
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Внешний вид"
        aria-expanded={open}
        title="Внешний вид"
      >
        <Palette size={18} aria-hidden="true" />
      </Button>
      {open ? (
        <div className="animate-pop-in absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 shadow-pop">
          <ThemeSwitcher />
        </div>
      ) : null}
    </div>
  );
}