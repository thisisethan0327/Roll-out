'use client';
/**
 * Two-tap "armed" confirm: the popconfirm for small row-level actions
 * (remove a line, delete a photo, unban). First tap arms the button (show
 * "Tap again to …"), the second tap runs the action.
 *
 *     const [armed, arm, disarm] = useArmed();
 *     <button onClick={() => arm(row.id, () => remove(row))} aria-pressed={armed === row.id}>
 *         {armed === row.id ? 'Tap again to remove' : 'Remove'}
 *     </button>
 *
 * Owner decision 2026-10-24 (Documents/CLAUDE.md §12): **no timer**. A button
 * stays armed until the second tap. A tap anywhere else, Escape, or leaving
 * the page disarms it (Escape disarms first, before it closes anything);
 * arming another row moves the arm. A 3 s timer lost taps on phones
 * (OrderActions run-10 bug). Pass `ms` to bring a timer back for one use only.
 *
 * Ported from emwraps-tickets `ui/useArmed.js` (7df9702); Escape added.
 */
import { useEffect, useRef, useState } from 'react';
import { pushLayer } from './core';

export function useArmed<K extends string | number = string>(ms: number | null = null) {
    const [armed, setArmed] = useState<K | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const ownClick = useRef(false);
    useEffect(() => () => clearTimeout(timer.current), []);

    // A tap anywhere that isn't an armed button's own click disarms. Escape
    // disarms too: while armed the button is the top layer of the overlay
    // stack, so the Escape that disarms it does not also close the Sheet or
    // dialog it sits in.
    useEffect(() => {
        if (armed == null) return undefined;
        const onClick = () => {
            if (ownClick.current) return;
            setArmed(null);
        };
        document.addEventListener('click', onClick);
        const { remove } = pushLayer(() => setArmed(null));
        return () => {
            document.removeEventListener('click', onClick);
            remove();
        };
    }, [armed]);

    const trigger = (key: K, action: () => void) => {
        // React handles this click before the document listener sees it.
        ownClick.current = true;
        setTimeout(() => {
            ownClick.current = false;
        }, 0);
        clearTimeout(timer.current);
        if (armed === key) {
            setArmed(null);
            action();
            return;
        }
        setArmed(key);
        if (ms != null) timer.current = setTimeout(() => setArmed(null), ms);
    };
    const disarm = () => {
        clearTimeout(timer.current);
        setArmed(null);
    };
    return [armed, trigger, disarm] as const;
}
