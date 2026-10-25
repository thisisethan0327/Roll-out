'use client';
/**
 * <ToastHost/>: renders the toast queue (src/lib/overlay/toast-store.ts).
 * Mounted once in app/layout.tsx; call from anywhere on the client:
 *
 *     import { toast, undoToast } from '@/components/glide/Toast';
 *     toast.success('Refund issued');
 *     toast.error('Refund failed: ' + message);      // stays until dismissed
 *     undoToast({ message: 'Post deleted', onUndo: restore });
 *
 * Bottom centre, above the page and every overlay, inside the safe area. A
 * toast is for a one-off result; a state that persists ("Payment authorized")
 * stays an inline Notice. Errors are `role="alert"` and never auto-dismiss.
 * Hover, focus or a touch pauses the countdown. Policy (cap 3, dedupe,
 * durations) lives in the store; ported from emwraps-tickets
 * ToastContainer + uiStore (7df9702).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import {
    getServerToasts,
    getToasts,
    removeToast,
    subscribeToasts,
    type Toast as ToastT,
    type ToastType,
} from '@/lib/overlay/toast-store';

export { toast, undoToast, clearToasts } from '@/lib/overlay/toast-store';

const ICON: Record<ToastType, typeof Info> = {
    success: CircleCheck,
    error: CircleAlert,
    warning: TriangleAlert,
    info: Info,
};

function ToastItem({ t }: { t: ToastT }) {
    const [paused, setPaused] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const remaining = useRef(t.duration ?? 0);
    const auto = t.duration !== null;

    useEffect(() => {
        remaining.current = t.duration ?? 0;
    }, [t.id, t.duration, t.nonce]);

    useEffect(() => {
        if (!auto || paused) return undefined;
        const startedAt = Date.now();
        const timer = setTimeout(() => removeToast(t.id), Math.max(remaining.current, 0));
        return () => {
            clearTimeout(timer);
            remaining.current = Math.max(remaining.current - (Date.now() - startedAt), 0);
        };
    }, [t.id, t.nonce, auto, paused]);

    const close = () => {
        setLeaving(true);
        setTimeout(() => removeToast(t.id), 160);
    };
    const Icon = ICON[t.type];

    return (
        <li
            className={`g-toast g-toast--${t.type}${leaving ? ' is-leaving' : ''}`}
            role={t.type === 'error' ? 'alert' : undefined}
            data-toast-id={t.id}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <span className="g-toast-ic" aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
            </span>
            <span className="g-toast-t">
                <b>{t.message}</b>
                {t.description ? <small>{t.description}</small> : null}
            </span>
            {t.action ? (
                <button type="button" className="g-toast-act" onClick={t.action.onClick}>
                    {t.action.label}
                </button>
            ) : null}
            <button type="button" className="g-toast-x" onClick={close} aria-label="Dismiss">
                <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            {auto ? (
                <span className="g-toast-bar" aria-hidden="true">
                    <span
                        key={t.nonce}
                        style={{ animationDuration: `${t.duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                    />
                </span>
            ) : null}
        </li>
    );
}

export function ToastHost() {
    const list = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
    // Always rendered, so the live region exists before the first toast.
    return (
        <div className="glide g-toasts" role="status" aria-live="polite">
            <ul>
                {list.map((t) => (
                    <ToastItem key={t.id} t={t} />
                ))}
            </ul>
        </div>
    );
}
