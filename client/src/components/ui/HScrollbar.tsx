import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

/** Минимальная ширина бегунка, px */
const MIN_THUMB = 24;

/**
 * Тонкая полупрозрачная горизонтальная полоса прокрутки для блока `target`
 * (у самого блока системная полоса скрыта классом scroll-ghost). Располагается
 * родителем; без переполнения не показывается. Бегунок перетаскивается,
 * щелчок по дорожке прокручивает к этому месту.
 */
export function HScrollbar({ target, className = '' }: { target: RefObject<HTMLElement | null>; className?: string }) {
    const track = useRef<HTMLDivElement>(null);
    const [geo, setGeo] = useState({ left: 0, width: 0, show: false });
    const drag = useRef<{ startX: number; startScroll: number } | null>(null);

    const update = useCallback(() => {
        const el = target.current;
        const t = track.current;
        if (!el || !t) return;
        const room = t.clientWidth;
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 1 || room <= 0) {
            setGeo((g) => (g.show ? { left: 0, width: 0, show: false } : g));
            return;
        }
        const width = Math.max(MIN_THUMB, (el.clientWidth / el.scrollWidth) * room);
        const left = (el.scrollLeft / max) * (room - width);
        setGeo({ left, width, show: true });
    }, [target]);

    useEffect(() => {
        const el = target.current;
        if (!el) return;
        update();
        el.addEventListener('scroll', update, { passive: true });
        // Размер меняется и у самого блока, и у его содержимого
        const observer = new ResizeObserver(update);
        observer.observe(el);
        if (el.firstElementChild) observer.observe(el.firstElementChild);
        if (track.current) observer.observe(track.current);
        return () => {
            el.removeEventListener('scroll', update);
            observer.disconnect();
        };
    }, [target, update]);

    const maxScroll = () => {
        const el = target.current;
        return el ? el.scrollWidth - el.clientWidth : 0;
    };

    const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startScroll: target.current?.scrollLeft ?? 0 };
    };
    const onThumbMove = (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        const el = target.current;
        const room = (track.current?.clientWidth ?? 0) - geo.width;
        if (!d || !el || room <= 0) return;
        el.scrollLeft = d.startScroll + ((e.clientX - d.startX) * maxScroll()) / room;
    };
    const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const el = target.current;
        const rect = e.currentTarget.getBoundingClientRect();
        const room = rect.width - geo.width;
        if (!el || room <= 0) return;
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left - geo.width / 2) / room));
        el.scrollTo({ left: ratio * maxScroll(), behavior: 'smooth' });
    };

    return (
        <div
            ref={track}
            aria-hidden="true"
            className={`group flex h-2 items-center transition-opacity ${geo.show ? 'opacity-100' : 'pointer-events-none opacity-0'} ${className}`}
            onPointerDown={onTrackDown}
        >
            <div
                className="h-[3px] cursor-grab rounded-full bg-[rgb(128_128_128/0.3)] transition-[height,background-color] group-hover:h-1 hover:bg-[rgb(128_128_128/0.6)] active:cursor-grabbing"
                style={{ width: geo.width, transform: `translateX(${geo.left}px)`, touchAction: 'none' }}
                onPointerDown={onThumbDown}
                onPointerMove={onThumbMove}
                onPointerUp={() => (drag.current = null)}
            />
        </div>
    );
}
