'use client';
/**
 * Drawer: a right-hand panel on desktop, a full-screen sheet on a phone
 * (under 760px). The home for long overlay forms: many fields, scrolling,
 * the page still visible behind it on desktop. Owner decision 2026-10-24:
 * every long form is a drawer on desktop + a full-screen sheet on a phone,
 * with a local autosaved draft (pair it with `useFormDraft` /
 * `DraftResumeBar`).
 *
 * Same contract as Modal (`dirty`, `closable`, `onDiscard`, opt-in
 * `closeOnBackdrop`, never for a form). `size`: 'md' 640px | 'lg' 860px.
 * Ported from emwraps-tickets `ui/Drawer.jsx` (7df9702).
 */
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useOverlayLayer, useRequestClose, useScrollLock } from '@/lib/overlay/stack';
import { overlayInitialFocus, useFocusTrap } from '@/lib/overlay/useFocusTrap';
import type { OverlayFormProps } from './Modal';

export function Drawer({
    open,
    onClose,
    title,
    children,
    footer,
    size = 'md',
    closeOnBackdrop = false,
    dirty = false,
    closable = true,
    onDiscard,
    discardTitle,
    discardMessage,
    initialFocus,
    titleId: titleIdProp,
    className,
}: OverlayFormProps & { size?: 'md' | 'lg' }) {
    const panelRef = useRef<HTMLDivElement>(null);
    const autoId = useId();
    const titleId = titleIdProp ?? autoId;
    const requestClose = useRequestClose({ onClose, onDiscard, dirty, closable, discardTitle, discardMessage });
    useOverlayLayer(open, () => void requestClose());
    useScrollLock(open);
    useFocusTrap(panelRef, open, () => overlayInitialFocus(panelRef.current, initialFocus));

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="glide g-ov-root g-drawer-root" data-lenis-prevent="">
            <div className="g-ov-scrim" aria-hidden="true" onClick={closeOnBackdrop ? () => void requestClose() : undefined} />
            <div
                ref={panelRef}
                className={`g-drawer${size === 'lg' ? ' g-drawer--lg' : ''}${className ? ` ${className}` : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-busy={!closable || undefined}
                tabIndex={-1}
            >
                <div className="g-ov-h">
                    <h2 id={titleId}>{title}</h2>
                    <button
                        type="button"
                        className="g-cb g-cb--fill"
                        onClick={() => void requestClose()}
                        disabled={!closable}
                        aria-label="Close"
                    >
                        <X size={20} strokeWidth={2} aria-hidden="true" />
                    </button>
                </div>
                <div className="g-ov-body">{children}</div>
                {footer ? <div className="g-ov-foot">{footer}</div> : null}
            </div>
        </div>,
        document.body,
    );
}
