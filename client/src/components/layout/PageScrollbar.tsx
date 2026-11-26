import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

/** Высота шапки и нижней панели, px */
const HEADER = 64;
const BOTTOM_BAR = 64;

/** Вертикальная полоса прокрутки страницы: от низа шапки до верха подвала (компьютер) или нижней панели (телефон) */
export function PageScrollbar() {
  const [geo, setGeo] = useState({ bottom: 0, thumbTop: 0, thumbH: 0, show: false });
  const track = useRef(0);
  const drag = useRef<{ startY: number; startScroll: number } | null>(null);

  const update = useCallback(() => {
    const vh = window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    let bottom = desktop ? 0 : BOTTOM_BAR;
    if (desktop) {
      const footer = document.querySelector('[data-app-footer]');
      if (footer) bottom = Math.max(0, vh - footer.getBoundingClientRect().top);
    }
    const length = Math.max(0, vh - HEADER - bottom);
    track.current = length;
    const thumbH = Math.max(36, (vh / Math.max(total, 1)) * length);
    const max = total - vh;
    const thumbTop = max > 0 ? (window.scrollY / max) * (length - thumbH) : 0;
    setGeo({ bottom, thumbTop, thumbH, show: total > vh + 1 && length > 60 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [update]);

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

  const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startScroll: window.scrollY };
  };
  const onThumbMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const room = track.current - geo.thumbH;
    if (!d || room <= 0) return;
    window.scrollTo({ top: d.startScroll + ((e.clientY - d.startY) * maxScroll()) / room });
  };
  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const room = rect.height - geo.thumbH;
    if (room <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top - geo.thumbH / 2) / room));
    window.scrollTo({ top: ratio * maxScroll(), behavior: 'smooth' });
  };

  if (!geo.show) return null;
  return (
    <div
      aria-hidden="true"
      className="fixed right-0 z-40 w-3"
      style={{ top: HEADER, bottom: geo.bottom }}
      onPointerDown={onTrackDown}
    >
      <div
        className="absolute right-0.5 w-2 cursor-grab rounded-full bg-[rgb(128_128_128/0.45)] transition-colors hover:bg-[rgb(128_128_128/0.7)] active:cursor-grabbing"
        style={{ top: geo.thumbTop, height: geo.thumbH, touchAction: 'none' }}
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={() => (drag.current = null)}
      />
    </div>
  );
}