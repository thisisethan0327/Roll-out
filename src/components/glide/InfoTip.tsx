'use client';
/**
 * InfoTip: a small (i) button that shows a standing rule in a bubble, so the
 * rule stops being a paragraph under every field (copy rule, Documents/
 * CLAUDE.md §12 "UI copy: let the layout explain").
 *
 *     <label>Location detail <InfoTip text="Shown instead of the venue when…" /></label>
 *
 * Opens on hover and keyboard focus (desktop) and on tap (the trigger is a
 * real <button>, so a tap focuses and toggles it). Closes on blur, a second
 * tap, a tap elsewhere, or Escape; Escape goes through the overlay stack, so
 * a tip inside a Sheet closes before the Sheet does. The bubble is portalled
 * to <body> in fixed coordinates (a scrolling card can't clip it), flips above
 * the trigger when there is no room below, and is clamped inside a 375px
 * screen. The trigger is a 44px target with a 16px icon.
 *
 * Use it for a rule a person needs once, never for an error, a money or
 * privacy warning, or anything that says an email goes out (those stay on the
 * page). Rebuilt on the emwraps-tickets `ui/InfoTip.jsx` contract (7df9702).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useOverlayLayer } from '@/lib/overlay/stack';

export function InfoTip({ text, label = 'More info' }: { text: ReactNode; label?: string }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const tipId = useId();
    // A tap fires mouseenter + focus (open) and then click: the click must not
    // close what the same tap just opened.
    const openedAt = useRef(0);
    const show = () => {
        setOpen((o) => {
            if (!o) openedAt.current = Date.now();
            return true;
        });
    };

    useOverlayLayer(open, () => setOpen(false));

    const place = useCallback(() => {
        const btn = btnRef.current;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const w = bubbleRef.current?.offsetWidth || 260;
        const h = bubbleRef.current?.offsetHeight || 0;
        const m = 8;
        const left = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - m));
        const below = window.innerHeight - r.bottom;
        const flip = below < h + 12 && r.top > h + 12;
        setPos({ top: flip ? r.top - h - 6 : r.bottom + 6, left });
    }, []);

    // Two passes: mount the bubble (so it has a size), then place it.
    useLayoutEffect(() => {
        if (open) place();
        else setPos(null);
    }, [open, place]);

    useEffect(() => {
        if (!open) return undefined;
        const onMove = () => place();
        const onDown = (e: PointerEvent) => {
            if (btnRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        document.addEventListener('pointerdown', onDown);
        return () => {
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
            document.removeEventListener('pointerdown', onDown);
        };
    }, [open, place]);

    if (!text) return null;

    return (
        <span className="g-tip">
            <button
                ref={btnRef}
                type="button"
                className="g-tip-b"
                aria-label={label}
                aria-describedby={open ? tipId : undefined}
                aria-expanded={open}
                onMouseEnter={show}
                onMouseLeave={() => setOpen(false)}
                onFocus={show}
                onBlur={() => setOpen(false)}
                onClick={(e) => {
                    // Inside a <label>, a click would also focus the field.
                    e.preventDefault();
                    e.stopPropagation();
                    if (open && Date.now() - openedAt.current < 400) return;
                    if (open) setOpen(false);
                    else show();
                }}
            >
                <Info size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            {open && typeof document !== 'undefined'
                ? createPortal(
                      <div
                          ref={bubbleRef}
                          id={tipId}
                          role="tooltip"
                          className="glide g-tip-bubble"
                          style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
                      >
                          {text}
                      </div>,
                      document.body,
                  )
                : null}
        </span>
    );
}
