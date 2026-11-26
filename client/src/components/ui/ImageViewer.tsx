import { ChevronLeft, ChevronRight, Download, Maximize, Minimize, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';

export interface ViewerImage {
  url: string;
  name: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const STEP = 0.25;
/** Длительность появления, исчезновения и смены кадра, мс */
const FADE_MS = 200;
/** Минимальная длина горизонтального свайпа, px */
const SWIPE_PX = 50;

/** Начальный масштаб: 100% на телефоне, 80% на компьютере */
function startZoom(): number {
  return window.matchMedia('(max-width: 767px)').matches ? 1 : 0.8;
}

const BTN =
  'flex size-10 items-center justify-center rounded-lg text-fg transition-colors hover:bg-surface-2 disabled:opacity-30';
const NAV_BTN = `${BTN} border border-border bg-surface shadow`;

/** Просмотр изображений: плавное открытие, листание (кнопки, клавиши, свайп), масштаб, скачивание, полный экран.
 *  Отрисовывается в body, поэтому не зависит от родителей (transform, overflow, z-index) */
export function ImageViewer({
  images,
  start,
  onClose,
}: {
  images: ViewerImage[];
  start: number;
  onClose: () => void;
}) {
  const [base] = useState(startZoom);
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(base);
  const [full, setFull] = useState(false);
  const [shown, setShown] = useState(false);
  const [slide, setSlide] = useState<{ dir: 1 | -1; phase: 'out' | 'in' | null }>({ dir: 1, phase: null });
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const image = images[index];
  const many = images.length > 1;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    const pending = timers.current;
    return () => {
      cancelAnimationFrame(frame);
      pending.forEach(window.clearTimeout);
    };
  }, []);

  const close = useCallback(() => {
    setShown(false);
    later(onClose, FADE_MS);
  }, [onClose]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (slide.phase) return;
      setSlide({ dir, phase: 'out' });
      later(() => {
        setIndex((i) => (i + dir + images.length) % images.length);
        setZoom(base);
        setSlide({ dir, phase: 'in' });
        requestAnimationFrame(() => requestAnimationFrame(() => setSlide({ dir, phase: null })));
      }, FADE_MS / 2);
    },
    [images.length, slide.phase, base]
  );

  const zoomBy = useCallback((delta: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta))), []);

  /** Щелчок по изображению: увеличить вдвое, повторный щелчок возвращает исходный масштаб */
  const toggleZoom = () => setZoom((z) => (z > base + 0.01 ? base : Math.min(MAX_ZOOM, base * 2)));

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  }, []);

  const onTouchStart = (e: TouchEvent) => {
    // Один палец; при увеличенном изображении жест остаётся для прокрутки
    if (e.touches.length !== 1 || zoom > base + 0.01) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: TouchEvent) => {
    const from = touchStart.current;
    touchStart.current = null;
    if (!from || !many) return;
    const dx = e.changedTouches[0].clientX - from.x;
    const dy = e.changedTouches[0].clientY - from.y;
    // Достаточно длинный и преимущественно горизонтальный свайп
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
    }
  };

  useEffect(() => {
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && many) go(-1);
      else if (e.key === 'ArrowRight' && many) go(1);
      else if (e.key === '+' || e.key === '=') zoomBy(STEP);
      else if (e.key === '-') zoomBy(-STEP);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close, go, zoomBy, many]);

  // Выход из полноэкранного режима при закрытии окна
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen();
    },
    []
  );

  const download = () => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.name;
    link.click();
  };

  const shift = slide.phase === 'out' ? -slide.dir * 48 : slide.phase === 'in' ? slide.dir * 48 : 0;
  const frameOpacity = slide.phase ? 0 : 1;
  // Во время «in» переход выключен: кадр мгновенно встаёт за край и затем въезжает
  const frameTransition = slide.phase === 'in' ? 'none' : `transform ${FADE_MS}ms ease, opacity ${FADE_MS}ms ease`;
  // Прокрутка только когда изображение увеличено сверх исходного и нет смены кадра
  const scrollable = zoom > base + 0.01 && !slide.phase;

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      className="fixed inset-0 z-[100] flex flex-col bg-black/60"
      style={{ opacity: shown ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
      onClick={close}
    >
      {/* Панель инструментов: цвета берутся из темы (светлая, тёмная, пастельная) */}
      <div
        className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 text-fg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm font-medium">
          {image.name}
          {many ? <span className="tabular ml-2 text-muted">{index + 1} / {images.length}</span> : null}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={BTN} aria-label="Уменьшить" title="Уменьшить" disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-STEP)}>
            <ZoomOut size={20} />
          </button>
          <span className="tabular w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
          <button type="button" className={BTN} aria-label="Увеличить" title="Увеличить" disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(STEP)}>
            <ZoomIn size={20} />
          </button>
          <button type="button" className={BTN} aria-label="Скачать" title="Скачать" onClick={download}>
            <Download size={20} />
          </button>
          <button type="button" className={BTN} aria-label={full ? 'Выйти из полноэкранного режима' : 'На весь экран'} title="На весь экран" onClick={toggleFull}>
            {full ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button type="button" className={BTN} aria-label="Закрыть" title="Закрыть" onClick={close}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Область просмотра: щелчок по тёмному фону закрывает, горизонтальный свайп листает */}
      <div
        className={`relative flex h-0 min-h-0 w-full flex-1 touch-pan-y items-center justify-center p-4 pb-20 md:pb-4 ${scrollable ? 'overflow-auto' : 'overflow-hidden'}`}
        onClick={close}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="pointer-events-none flex h-full w-full items-center justify-center"
          style={{
            transform: `translateX(${shift}px) scale(${shown ? 1 : 0.96})`,
            opacity: shown ? frameOpacity : 0,
            transition: frameTransition,
          }}
        >
          <img
            src={image.url}
            alt={image.name}
            draggable={false}
            style={{ transform: `scale(${zoom})`, transition: 'transform 180ms ease' }}
            className="pointer-events-auto max-h-full max-w-full cursor-zoom-in rounded-xl object-contain"
            onClick={(e) => {
              e.stopPropagation();
              toggleZoom();
            }}
            onWheel={(e) => zoomBy(e.deltaY < 0 ? STEP : -STEP)}
          />
        </div>

        {/* Телефон: две кнопки рядом внизу по центру; от 768px: по бокам экрана */}
        {many ? (
          <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 md:contents">
            <button
              type="button"
              className={`${NAV_BTN} md:fixed md:top-1/2 md:left-4 md:-translate-y-1/2`}
              aria-label="Предыдущее"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className={`${NAV_BTN} md:fixed md:top-1/2 md:right-4 md:-translate-y-1/2`}
              aria-label="Следующее"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
            >
              <ChevronRight size={22} />
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}