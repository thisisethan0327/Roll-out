'use client';
/**
 * Slide-to-act (R5 `.slide`): the primary action as a pill whose knob drags.
 *
 *  - Drag the knob past ~82% of its travel and release → onComplete.
 *  - A short drag springs back.
 *  - A tap, Enter or Space on the knob also completes (it is a real button),
 *    so it never depends on a drag gesture.
 *  - When `done`, the pill shows the done state (done / on-done tokens) and a
 *    tap on the knob calls onUndo, if given.
 *
 * Controlled: the parent owns `done` (it usually reflects a server write) and
 * `busy`. Reduced motion: the CSS drops the spring and the chevron pulse.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronRight, CircleCheck, LoaderCircle } from 'lucide-react';

export const SLIDE_THRESHOLD = 0.82;
const PAD = 6;

export function SlideToAct({
    label,
    sub,
    doneLabel,
    ariaLabel,
    doneAriaLabel,
    done = false,
    busy = false,
    disabled = false,
    onComplete,
    onUndo,
    className,
}: {
    /** Idle label, e.g. "Slide to RSVP". */
    label: ReactNode;
    /** Small secondary text after the label (e.g. a price). */
    sub?: ReactNode;
    /** Label in the done state, e.g. "You're in". */
    doneLabel: ReactNode;
    /** Accessible name of the knob when idle. */
    ariaLabel: string;
    /** Accessible name of the knob when done (only meaningful with onUndo). */
    doneAriaLabel?: string;
    done?: boolean;
    busy?: boolean;
    disabled?: boolean;
    onComplete: () => void;
    onUndo?: () => void;
    className?: string;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLButtonElement>(null);
    const drag = useRef<{ x: number; moved: boolean } | null>(null);
    const lastUp = useRef(0);
    const [p, setP] = useState(done ? 1 : 0);
    const [dragging, setDragging] = useState(false);

    const travel = useCallback(() => {
        const r = rootRef.current;
        const k = knobRef.current;
        if (!r || !k) return 0;
        return Math.max(0, r.offsetWidth - k.offsetWidth - 2 * PAD);
    }, []);

    // Keep the CSS travel distance in step with the pill's width.
    useEffect(() => {
        const r = rootRef.current;
        if (!r) return;
        const measure = () => r.style.setProperty('--tr', `${travel()}px`);
        measure();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
        ro?.observe(r);
        return () => ro?.disconnect();
    }, [travel]);

    // The parent's state wins once a drag is over.
    useEffect(() => {
        if (!drag.current) setP(done ? 1 : 0);
    }, [done]);

    const inert = disabled || busy;

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (done || inert || e.button !== 0) return;
        drag.current = { x: e.clientX, moved: false };
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* capture is best-effort */
        }
        setDragging(true);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 3) d.moved = true;
        const t = travel();
        setP(t > 0 ? Math.max(0, Math.min(1, dx / t)) : 0);
    };
    const finish = (cancelled: boolean) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        setDragging(false);
        lastUp.current = Date.now();
        if (cancelled) {
            setP(0);
            return;
        }
        if (p >= SLIDE_THRESHOLD || !d.moved) {
            setP(1);
            onComplete();
        } else {
            setP(0);
        }
    };
    const onClick = () => {
        // A pointer sequence already handled this press; the click is for
        // keyboard (Enter / Space) and assistive tech.
        if (Date.now() - lastUp.current < 500) return;
        if (inert) return;
        if (done) {
            onUndo?.();
            return;
        }
        setP(1);
        onComplete();
    };

    const cls = ['g-slide', done && 'is-done', dragging && 'is-dragging', busy && 'is-busy', disabled && 'is-disabled', className]
        .filter(Boolean)
        .join(' ');

    return (
        <div ref={rootRef} className={cls} style={{ ['--p' as string]: String(done ? 1 : p) }}>
            <span className="g-slide-fill" aria-hidden="true" />
            <span className="g-slide-lbl" aria-hidden="true">
                {done ? (
                    <>
                        <CircleCheck size={20} strokeWidth={2.2} />
                        {doneLabel}
                    </>
                ) : (
                    <>
                        {label}
                        {sub ? <small>{sub}</small> : null}
                    </>
                )}
            </span>
            {!done ? (
                <span className="g-slide-chev" aria-hidden="true">
                    <ChevronRight size={20} strokeWidth={2.4} />
                    <ChevronRight size={20} strokeWidth={2.4} />
                    <ChevronRight size={20} strokeWidth={2.4} />
                </span>
            ) : null}
            <button
                ref={knobRef}
                type="button"
                className="g-slide-knob"
                aria-label={done ? (doneAriaLabel ?? ariaLabel) : ariaLabel}
                aria-pressed={done}
                aria-busy={busy || undefined}
                disabled={disabled || (done && !onUndo)}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => finish(false)}
                onPointerCancel={() => finish(true)}
                onClick={onClick}
            >
                {busy ? (
                    <LoaderCircle size={22} strokeWidth={2.2} className="g-spin" aria-hidden="true" />
                ) : done ? (
                    <Check size={22} strokeWidth={2.2} aria-hidden="true" />
                ) : (
                    <ArrowRight size={22} strokeWidth={2.2} aria-hidden="true" />
                )}
            </button>
        </div>
    );
}
