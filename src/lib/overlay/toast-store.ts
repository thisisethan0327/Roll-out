/**
 * The toast queue: a tiny module store (no zustand, no React), read by
 * <ToastHost/> through useSyncExternalStore. Plain so it is unit-tested on
 * its own. Policy ported from emwraps-tickets `uiStore.addToast` /
 * `addUndoToast` (7df9702):
 *
 * - success / info auto-dismiss after 6 s; **errors and warnings stay until
 *   dismissed** (`duration: null`). An explicit positive duration wins.
 * - The same message of the same type already on screen restarts its
 *   countdown instead of stacking a twin (a retried save).
 * - **At most 3 on screen**: the oldest auto-dismissing one makes room;
 *   persistent ones are never pushed out.
 * - `undoToast` is a snackbar: Undo removes it and runs onUndo; after the
 *   duration the change simply stands.
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastAction = { label: string; onClick: () => void };

export type Toast = {
    id: number;
    type: ToastType;
    message: string;
    description?: string;
    /** Milliseconds; null = stays until dismissed. */
    duration: number | null;
    action?: ToastAction;
    /** Bumped when a twin restarts this toast's countdown. */
    nonce: number;
};

export type ToastInput = {
    type?: ToastType;
    message: string;
    description?: string;
    /** A positive number of ms overrides the type's default. */
    duration?: number | null;
    action?: ToastAction;
};

export const MAX_TOASTS = 3;
export const DEFAULT_DURATION = 6000;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeToasts(l: () => void) {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
}
export const getToasts = () => toasts;
const EMPTY: Toast[] = [];
export const getServerToasts = () => EMPTY;

export function resolveDuration(type: ToastType, explicit: number | null | undefined): number | null {
    if (typeof explicit === 'number' && explicit > 0) return explicit;
    return type === 'error' || type === 'warning' ? null : DEFAULT_DURATION;
}

export function addToast(input: ToastInput): number {
    const type = input.type ?? 'info';
    const duration = resolveDuration(type, input.duration);
    const twin = !input.action ? toasts.find((t) => t.message === input.message && t.type === type && !t.action) : undefined;
    if (twin) {
        toasts = toasts.map((t) => (t.id === twin.id ? { ...t, description: input.description, duration, nonce: t.nonce + 1 } : t));
        emit();
        return twin.id;
    }
    const id = ++seq;
    const next = [...toasts, { id, type, message: input.message, description: input.description, duration, action: input.action, nonce: 0 }];
    while (next.length > MAX_TOASTS) {
        const i = next.findIndex((t) => t.id !== id && t.duration !== null);
        if (i < 0) break;
        next.splice(i, 1);
    }
    toasts = next;
    emit();
    return id;
}

export function removeToast(id: number) {
    const next = toasts.filter((t) => t.id !== id);
    if (next.length === toasts.length) return;
    toasts = next;
    emit();
}

export function clearToasts() {
    toasts = [];
    emit();
}

/** A success / info / error toast. `toast.error('Refund failed: …')` etc. */
export const toast = Object.assign((message: string, opts: Omit<ToastInput, 'message'> = {}) => addToast({ ...opts, message }), {
    success: (message: string, opts: Omit<ToastInput, 'message' | 'type'> = {}) => addToast({ ...opts, type: 'success', message }),
    error: (message: string, opts: Omit<ToastInput, 'message' | 'type'> = {}) => addToast({ ...opts, type: 'error', message }),
    warning: (message: string, opts: Omit<ToastInput, 'message' | 'type'> = {}) => addToast({ ...opts, type: 'warning', message }),
    info: (message: string, opts: Omit<ToastInput, 'message' | 'type'> = {}) => addToast({ ...opts, type: 'info', message }),
    dismiss: removeToast,
});

/**
 * Snackbar for a reversible change: "Post deleted · Undo". Undo removes the
 * toast and runs onUndo; after `duration` (default 5 s) the change stands.
 */
export function undoToast({
    message,
    description,
    onUndo,
    duration = 5000,
    type = 'info',
}: {
    message: string;
    description?: string;
    onUndo: () => void;
    duration?: number;
    type?: ToastType;
}): number {
    let id = 0;
    id = addToast({
        type,
        message,
        description,
        duration,
        action: {
            label: 'Undo',
            onClick: () => {
                removeToast(id);
                onUndo();
            },
        },
    });
    return id;
}
