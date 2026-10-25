'use client';
/**
 * Touch swipe handlers: spread onto the element that should react.
 *
 *     const swipe = useSwipe({ onDown: close, threshold: 60 });
 *     <div {...swipe}>…</div>
 *
 * One axis wins per gesture (the larger movement), so a vertical scroll never
 * fires onLeft / onRight. Ported from emwraps-tickets `hooks/useSwipe.js`
 * (7df9702).
 */
import { useRef, type TouchEvent } from 'react';

export type SwipeHandlers = {
    onLeft?: () => void;
    onRight?: () => void;
    onDown?: () => void;
    onUp?: () => void;
    /** Pixels the finger must travel. Default 50. */
    threshold?: number;
};

export function useSwipe({ onLeft, onRight, onDown, onUp, threshold = 50 }: SwipeHandlers = {}) {
    const start = useRef<{ x: number; y: number } | null>(null);
    return {
        onTouchStart: (e: TouchEvent) => {
            const t = e.touches[0];
            start.current = t ? { x: t.clientX, y: t.clientY } : null;
        },
        onTouchEnd: (e: TouchEvent) => {
            const s = start.current;
            start.current = null;
            if (!s) return;
            const t = e.changedTouches[0];
            if (!t) return;
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            if (Math.abs(dx) >= Math.abs(dy)) {
                if (dx <= -threshold) onLeft?.();
                else if (dx >= threshold) onRight?.();
            } else if (dy >= threshold) onDown?.();
            else if (dy <= -threshold) onUp?.();
        },
        onTouchCancel: () => {
            start.current = null;
        },
    };
}
