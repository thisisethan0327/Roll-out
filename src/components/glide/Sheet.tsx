'use client';
/**
 * Bottom sheet (R5 `.sheet`): grab handle, 30px top radius, a scrim at
 * rgba(var(--scrim), .45). For menus, pickers and one-field forms; a long
 * form goes in a Drawer.
 *
 * Overlay contract (emwraps-tickets `ui/Sheet.jsx`, 7df9702; overlay plan
 * Phase 1):
 *   closeOnBackdrop  default true (a menu holds no typed data); pass false
 *                    once the sheet holds typed input
 *   dirty            ×, Escape and swipe-down (and the scrim, if it closes)
 *                    ask "Discard changes?" first
 *   closable         false while a save is in flight: nothing closes it
 *   onDiscard        runs after "Discard" (e.g. clear a local draft)
 *
 * Escape and the scroll lock go through the shared overlay stack
 * (src/lib/overlay), so a confirm or picker on top closes first and the page
 * stays locked until the last overlay closes. Swipe down on the grab handle
 * or header closes it on a phone. Focus moves in on open, Tab stays inside,
 * and focus returns to whatever opened it.
 *
 * Rendered into document.body so no ancestor's stacking context can trap it.
 * The portal root carries `.glide` so the tokens apply there too.
 */
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useOverlayLayer, useRequestClose, useScrollLock } from '@/lib/overlay/stack';
import { useFocusTrap } from '@/lib/overlay/useFocusTrap';
import { useSwipe } from '@/lib/overlay/useSwipe';

export function Sheet({
    open,
    onClose,
    title,
    children,
    footer,
    closeOnBackdrop = true,
    dirty = false,
    closable = true,
    onDiscard,
    discardTitle,
    discardMessage,
    className,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    /** Sticky action row under the body. */
    footer?: ReactNode;
    /** False once the sheet holds typed input: a stray tap on the scrim must not discard it. */
    closeOnBackdrop?: boolean;
    dirty?: boolean;
    closable?: boolean;
    onDiscard?: () => void;
    discardTitle?: string;
    discardMessage?: string;
    className?: string;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const requestClose = useRequestClose({ onClose, onDiscard, dirty, closable, discardTitle, discardMessage });
    useOverlayLayer(open, () => void requestClose());
    useScrollLock(open);
    useFocusTrap(panelRef, open);
    const swipe = useSwipe({ onDown: () => void requestClose(), threshold: 60 });

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="glide g-sheet-root" data-lenis-prevent="">
            <div className="g-sheet-scrim" onClick={closeOnBackdrop ? () => void requestClose() : undefined} aria-hidden="true" />
            <div
                ref={panelRef}
                className={`g-sheet${className ? ` ${className}` : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="g-sheet-top" {...swipe}>
                    <div className="g-sheet-grab" aria-hidden="true" />
                    <div className="g-sheet-h">
                        <h2 id={titleId}>{title}</h2>
                        <button
                            type="button"
                            className="g-cb g-cb--fill"
                            onClick={() => void requestClose()}
                            disabled={!closable}
                            aria-label="Close"
                        >
                            <X size={18} strokeWidth={2} aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div className="g-sheet-body">{children}</div>
                {footer ? <div className="g-sheet-foot">{footer}</div> : null}
            </div>
        </div>,
        document.body,
    );
}
