'use client';
/**
 * Bottom sheet (R5 `.sheet`): grab handle, 30px top radius, a scrim at
 * rgba(var(--scrim), .45). Closes on ×, on the scrim, and on Escape; focus
 * moves into the sheet on open, Tab stays inside it, and focus returns to
 * whatever opened it on close. The page behind does not scroll while open.
 *
 * Rendered into document.body so no ancestor's stacking context can trap it.
 * The portal root carries `.glide` so the tokens apply there too.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
    open,
    onClose,
    title,
    children,
    closeOnBackdrop = true,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    /** False once the sheet holds typed input: a stray tap on the scrim must not discard it. */
    closeOnBackdrop?: boolean;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const returnTo = useRef<HTMLElement | null>(null);
    const titleId = useId();
    // Held in a ref so a parent's inline arrow does not re-run the open effect
    // (which would steal focus back to the first control on every render).
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        returnTo.current = document.activeElement as HTMLElement | null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Focus the first control (the close button) once the panel is in.
        const t = window.setTimeout(() => {
            panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }, 0);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeRef.current();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            window.clearTimeout(t);
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            returnTo.current?.focus?.();
        };
    }, [open]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="glide g-sheet-root">
            <div className="g-sheet-scrim" onClick={closeOnBackdrop ? onClose : undefined} aria-hidden="true" />
            <div ref={panelRef} className="g-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <div className="g-sheet-grab" aria-hidden="true" />
                <div className="g-sheet-h">
                    <h2 id={titleId}>{title}</h2>
                    <button type="button" className="g-cb g-cb--fill" onClick={onClose} aria-label="Close">
                        <X size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                </div>
                <div className="g-sheet-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
