'use client';
/**
 * Modal: a centred Glide card over the scrim, a bottom card on a phone
 * (under 600px). For short decisions and short forms; a long form goes in a
 * Drawer, a menu or picker in a Sheet, a yes / no question in confirmDialog.
 *
 * Contract (emwraps-tickets `ui/Modal.jsx`, 7df9702; overlay plan Phase 1):
 *   dirty            ×, Escape (and the scrim, if it closes) ask "Discard
 *                    changes?" first
 *   closable         false while a save or money call is in flight: ×,
 *                    Escape and the scrim do nothing
 *   closeOnBackdrop  opt-in; a click outside never closes a form by default
 *   onDiscard        runs after "Discard" (e.g. clear a local draft)
 *   initialFocus     CSS selector of the control to focus on open. Default:
 *                    the first field of the body with a mouse; the panel
 *                    itself on a touch screen (no keyboard popping up)
 *
 * Escape reaches only the topmost overlay, and the page scroll lock is
 * counted (src/lib/overlay). Rendered into document.body inside `.glide`.
 */
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useOverlayLayer, useRequestClose, useScrollLock } from '@/lib/overlay/stack';
import { overlayInitialFocus, useFocusTrap } from '@/lib/overlay/useFocusTrap';

export type OverlayFormProps = {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    /** Action row under the body (stays in view while the body scrolls). */
    footer?: ReactNode;
    closeOnBackdrop?: boolean;
    dirty?: boolean;
    closable?: boolean;
    onDiscard?: () => void;
    discardTitle?: string;
    discardMessage?: string;
    initialFocus?: string;
    /** id for the title (aria-labelledby); generated when omitted. */
    titleId?: string;
    className?: string;
};

export function Modal({
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
        <div className="glide g-ov-root g-modal-root" data-lenis-prevent="">
            <div className="g-ov-scrim" aria-hidden="true" onClick={closeOnBackdrop ? () => void requestClose() : undefined} />
            <div
                ref={panelRef}
                className={`g-modal${size === 'lg' ? ' g-modal--lg' : ''}${className ? ` ${className}` : ''}`}
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
