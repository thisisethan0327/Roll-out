'use client';
/**
 * confirmDialog() + <ConfirmHost/>: the app's AlertDialog, replacing
 * window.confirm / prompt, which production browsers can auto-dismiss (a
 * dismissed confirm silently skips the action; a dismissed alert hides a
 * failed refund). Ported from emwraps-tickets (lib/confirmDialog.js +
 * ui/ConfirmHost.jsx, b59e6b3) onto the Glide kit, same call shape:
 *
 *     if (!(await confirmDialog({ title: 'Refund $45.00 to @ana?', confirmLabel: 'Refund', danger: true }))) return;
 *     start(async () => { ... });
 *
 * Await the dialog BEFORE starting a transition, never inside one.
 *
 * Owner rules (Documents/CLAUDE.md §12, "Overlays"): the title names the
 * object, the button is a verb ("Refund", never "Yes, continue"), and focus
 * lands on Cancel. `reason` replaces prompt(): the dialog grows a text field
 * and resolves to the trimmed text (or null when cancelled).
 *
 * <ConfirmHost/> is mounted once, in app/layout.tsx. One dialog at a time; a
 * second request while one is open cancels the first. While open it is the
 * top layer of the overlay stack (src/lib/overlay), so Escape cancels it and
 * not the Sheet or form dialog underneath, and it keeps Tab inside the dialog.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from 'lucide-react';
import { lockScroll, pushLayer, unlockScroll } from '@/lib/overlay/core';

export type ConfirmReason = {
    /** Label over the text field, e.g. "Reason (internal)". */
    label: string;
    /** The confirm button stays off until something is typed. */
    required?: boolean;
    placeholder?: string;
    maxLength?: number;
};

export type ConfirmOptions = {
    /** A question that names the object: "Refund $45.00 to @ana?" */
    title: string;
    /** Detail under the title. Line breaks in a string are kept. */
    message?: ReactNode;
    /** A verb: "Refund", "Delete", "Grant". */
    confirmLabel?: string;
    cancelLabel?: string;
    /** Destructive or money: the confirm button gets the danger look. */
    danger?: boolean;
    reason?: ConfirmReason;
};

type Request = ConfirmOptions & { id: number; settle: (ok: boolean, text?: string) => void };

let current: Request | null = null;
let seq = 0;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};
const snapshot = () => current;

export function confirmDialog(input: ConfirmOptions & { reason: ConfirmReason }): Promise<string | null>;
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean>;
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean | string | null> {
    const opts: ConfirmOptions = typeof input === 'string' ? { title: input } : { ...input };
    return new Promise((resolve) => {
        const withReason = !!opts.reason;
        if (hosts === 0) {
            // Never fall back to window.confirm. A missing host is a wiring bug.
            console.error('[confirmDialog] no <ConfirmHost/> mounted; treating as cancelled.');
            resolve(withReason ? null : false);
            return;
        }
        current?.settle(false);
        const id = ++seq;
        current = {
            ...opts,
            id,
            settle: (ok, text) => {
                if (current?.id === id) {
                    current = null;
                    emit();
                }
                resolve(withReason ? (ok ? (text ?? '').trim() : null) : ok);
            },
        };
        emit();
    });
}

const FOCUSABLE =
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function ConfirmHost() {
    const req = useSyncExternalStore(subscribe, snapshot, () => null);
    useEffect(() => {
        hosts += 1;
        return () => {
            hosts -= 1;
        };
    }, []);
    if (!req || typeof document === 'undefined') return null;
    // Keyed by request so the reason text and focus reset for each dialog.
    return createPortal(<ConfirmDialogView key={req.id} req={req} />, document.body);
}

function ConfirmDialogView({ req }: { req: Request }) {
    const { title, message, confirmLabel, cancelLabel, danger, reason } = req;
    const [text, setText] = useState('');
    const panelRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const fieldRef = useRef<HTMLTextAreaElement>(null);
    const titleId = useId();
    const msgId = useId();
    const fieldId = useId();
    const textRef = useRef(text);
    textRef.current = text;

    useEffect(() => {
        const returnTo = document.activeElement as HTMLElement | null;
        // The top layer of the shared overlay stack: Escape cancels this
        // dialog only, never the Sheet or form under it, and the page scroll
        // lock is counted with theirs (src/lib/overlay).
        lockScroll();
        const layer = pushLayer(() => req.settle(false));
        // Focus Cancel (the safe choice), or the reason field when there is one.
        (reason ? fieldRef.current : cancelRef.current)?.focus();

        const onKey = (e: KeyboardEvent) => {
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
            } else if (!panelRef.current.contains(document.activeElement)) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            layer.remove();
            unlockScroll();
            returnTo?.focus?.();
        };
    }, []);

    const blocked = !!reason?.required && !text.trim();
    const ok = () => {
        if (blocked) return;
        req.settle(true, text);
    };

    return (
        <div className="glide g-dlg-root" data-lenis-prevent="">
            <div
                className="g-dlg-scrim"
                aria-hidden="true"
                // A typed reason is a form: a stray tap outside must not lose it.
                onClick={() => {
                    if (!reason || !textRef.current.trim()) req.settle(false);
                }}
            />
            <div
                ref={panelRef}
                className="g-dlg"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={message ? msgId : undefined}
            >
                <div className="g-dlg-h">
                    {danger ? (
                        <span className="g-dlg-ic" aria-hidden="true">
                            <TriangleAlert size={20} strokeWidth={2} />
                        </span>
                    ) : null}
                    <h2 id={titleId}>{title}</h2>
                </div>
                {message ? (
                    <div className="g-dlg-msg" id={msgId}>
                        {message}
                    </div>
                ) : null}
                {reason ? (
                    <div className="g-field g-dlg-field">
                        <label className="g-field-l" htmlFor={fieldId}>
                            {reason.label}
                        </label>
                        <textarea
                            ref={fieldRef}
                            id={fieldId}
                            className="g-in"
                            rows={3}
                            value={text}
                            maxLength={reason.maxLength ?? 1000}
                            placeholder={reason.placeholder}
                            required={reason.required}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    ok();
                                }
                            }}
                        />
                    </div>
                ) : null}
                <div className="g-dlg-acts">
                    <button ref={cancelRef} type="button" className="g-sec g-sec--ink" onClick={() => req.settle(false)}>
                        {cancelLabel || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        className={`g-dlg-ok${danger ? ' g-dlg-ok--danger' : ''}`}
                        onClick={ok}
                        disabled={blocked}
                    >
                        {confirmLabel || 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
