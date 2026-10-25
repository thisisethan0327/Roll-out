'use client';
/**
 * Lightbox: full-screen media viewer. Arrows, ← → keys, swipe, a counter;
 * Escape, × or a tap on the dark backdrop closes it; videos play inline.
 * Mount it while open:
 *
 *     {open != null && <Lightbox items={photos} startIndex={open} onClose={() => setOpen(null)} />}
 *
 *   items       [{ url, type?: 'image' | 'video', name? }]
 *   startIndex  number
 *   tools       optional (item, index) => node in the top bar (e.g. a download link)
 *   caption     optional (item, index) => node under the media
 *
 * Ported from emwraps-tickets `ui/Lightbox.jsx` (7df9702). Targets (overlay
 * plan Phase 5): check-in photos, kiosk gallery, report and DM media,
 * product gallery zoom.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useOverlayLayer, useScrollLock } from '@/lib/overlay/stack';
import { useFocusTrap } from '@/lib/overlay/useFocusTrap';
import { useSwipe } from '@/lib/overlay/useSwipe';

export type LightboxItem = { url: string; type?: 'image' | 'video'; name?: string };

export function Lightbox({
    items,
    startIndex = 0,
    onClose,
    tools,
    caption,
}: {
    items: LightboxItem[];
    startIndex?: number;
    onClose: () => void;
    tools?: (item: LightboxItem, index: number) => ReactNode;
    caption?: (item: LightboxItem, index: number) => ReactNode;
}) {
    const count = items.length;
    const [idx, setIdx] = useState(Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)));
    const go = (delta: number) => {
        if (count > 1) setIdx((i) => (i + delta + count) % count);
    };
    const panelRef = useRef<HTMLDivElement>(null);

    useOverlayLayer(true, onClose);
    useScrollLock(true);
    useFocusTrap(panelRef, true, () => panelRef.current?.querySelector<HTMLElement>('.g-lb-close'));
    const goRef = useRef(go);
    goRef.current = go;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;
            if (e.key === 'ArrowRight') goRef.current(1);
            else if (e.key === 'ArrowLeft') goRef.current(-1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    const swipe = useSwipe({ onLeft: () => go(1), onRight: () => go(-1), onDown: onClose });

    const item = items[idx];
    if (!item || typeof document === 'undefined') return null;
    const isVideo = item.type === 'video' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(item.url || '');
    const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
    const label = item.name || (isVideo ? 'Video' : 'Photo');

    return createPortal(
        <div
            ref={panelRef}
            className="glide g-lb"
            role="dialog"
            aria-modal="true"
            aria-label={count > 1 ? `${label}, ${idx + 1} of ${count}` : label}
            data-lenis-prevent=""
            onClick={onClose}
        >
            <div className="g-lb-top" onClick={stop}>
                <span className="g-lb-count g-w" aria-hidden="true">
                    {count > 1 ? `${idx + 1} / ${count}` : ''}
                </span>
                <div className="g-lb-tools">
                    {tools?.(item, idx)}
                    <button type="button" className="g-lb-btn g-lb-close" onClick={onClose} aria-label="Close">
                        <X size={22} strokeWidth={2} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {count > 1 ? (
                <>
                    <button
                        type="button"
                        className="g-lb-btn g-lb-arrow g-lb-arrow--l"
                        onClick={(e) => {
                            stop(e);
                            go(-1);
                        }}
                        aria-label="Previous"
                    >
                        <ChevronLeft size={26} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="g-lb-btn g-lb-arrow g-lb-arrow--r"
                        onClick={(e) => {
                            stop(e);
                            go(1);
                        }}
                        aria-label="Next"
                    >
                        <ChevronRight size={26} strokeWidth={2} aria-hidden="true" />
                    </button>
                </>
            ) : null}
            <div className="g-lb-stage" onClick={stop} {...swipe}>
                {isVideo ? (
                    <video key={item.url} src={item.url} className="g-lb-media" controls autoPlay playsInline />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={item.url} src={item.url} alt={item.name || ''} className="g-lb-media" />
                )}
                {caption ? <div className="g-lb-cap">{caption(item, idx)}</div> : null}
            </div>
        </div>,
        document.body,
    );
}
