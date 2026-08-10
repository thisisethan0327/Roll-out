'use client';
/**
 * PendingButton — a drop-in <button> that shows an animated working state while
 * an action is in flight. Matches the site's hand-rolled HUD buttons: pass the
 * existing className (`btn`, `admin-login-btn`, `admin-action-btn`, …) and it
 * inherits the look, adding only the busy affordances.
 *
 * When `pending` is true the button:
 *   - is disabled (double-submit guard — combine with the caller's own guard),
 *   - swaps its label to `pendingLabel` (default: the idle label) + pulsing dots,
 *   - gains a wait cursor via `.rl-busy`.
 *
 * This is a *presentational* helper. The caller still owns the pending flag
 * (useTransition / useFormStatus / local state) and the click/submit handler —
 * so behavior is unchanged, only feedback is added.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Dots } from './Dots';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    pending: boolean;
    /** Label shown while pending. Falls back to the idle children. */
    pendingLabel?: ReactNode;
    /** Idle label. */
    children: ReactNode;
};

export function PendingButton({
    pending,
    pendingLabel,
    children,
    className,
    disabled,
    ...rest
}: Props) {
    return (
        <button
            {...rest}
            className={`${className ?? ''}${pending ? ' rl-busy' : ''}`.trim()}
            disabled={disabled || pending}
            aria-busy={pending}
        >
            {pending ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {pendingLabel ?? children}
                    <Dots />
                </span>
            ) : (
                children
            )}
        </button>
    );
}
