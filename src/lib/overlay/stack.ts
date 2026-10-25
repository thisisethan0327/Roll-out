'use client';
/**
 * React side of the overlay stack (core in ./core.ts). Every Glide overlay
 * (Modal, Sheet, Drawer, Lightbox, InfoTip, confirmDialog) and every popover
 * that closes on Escape registers here, so one Escape closes one layer and
 * nested overlays never unlock the page early.
 *
 * Ported from emwraps-tickets `src/lib/overlayStack.js` (7df9702). Overlay
 * plan Phase 1; rules in docs/design/GLIDE.md "Overlays".
 */
import { useEffect, useRef } from 'react';
import { confirmDialog } from '@/components/glide/confirm';
import { isTopLayer, lockScroll, pushLayer, unlockScroll, type OverlayLayer } from './core';

export { claimPrompt, releasePrompt, isAnyOverlayOpen, lockScroll, unlockScroll } from './core';

/** Register this overlay while `active`; `onEscape` runs only when it is the top layer. */
export function useOverlayLayer(active: boolean, onEscape?: (e: KeyboardEvent) => void) {
    const cbRef = useRef(onEscape);
    cbRef.current = onEscape;
    const layerRef = useRef<OverlayLayer | null>(null);
    useEffect(() => {
        if (!active) return undefined;
        const { layer, remove } = pushLayer((e) => cbRef.current?.(e));
        layerRef.current = layer;
        return () => {
            remove();
            layerRef.current = null;
        };
    }, [active]);
    return { isTop: () => isTopLayer(layerRef.current) };
}

/** Lock body scroll while `active`, counted across every open overlay. */
export function useScrollLock(active: boolean) {
    useEffect(() => {
        if (!active) return undefined;
        lockScroll();
        return unlockScroll;
    }, [active]);
}

export type RequestCloseOptions = {
    onClose: () => void;
    /** Runs after "Discard" is confirmed, before onClose (e.g. clear the local draft). */
    onDiscard?: () => void;
    /** Something was typed: ask "Discard changes?" first. */
    dirty?: boolean;
    /** False while a save or money call is in flight: closing does nothing. */
    closable?: boolean;
    discardTitle?: string;
    discardMessage?: string;
};

/**
 * requestClose() for a Modal / Sheet / Drawer: refuses while `closable` is
 * false, asks "Discard changes?" when `dirty`, then calls onClose. Reads the
 * latest props on every call, so it is safe to hand to a key handler that
 * was bound once.
 */
export function useRequestClose(opts: RequestCloseOptions): () => Promise<void> {
    const ref = useRef(opts);
    ref.current = opts;
    const asking = useRef(false);
    const fn = useRef<() => Promise<void>>(async () => {});
    fn.current = async () => {
        const {
            onClose,
            onDiscard,
            dirty = false,
            closable = true,
            discardTitle = 'Discard changes?',
            discardMessage = 'What you entered here will be lost.',
        } = ref.current;
        if (!closable || asking.current) return;
        if (dirty) {
            asking.current = true;
            try {
                const ok = await confirmDialog({
                    title: discardTitle,
                    message: discardMessage,
                    confirmLabel: 'Discard',
                    cancelLabel: 'Keep editing',
                    danger: true,
                });
                if (!ok) return;
            } finally {
                asking.current = false;
            }
            onDiscard?.();
        }
        onClose();
    };
    // One stable function for the life of the component.
    const stable = useRef(() => fn.current());
    return stable.current;
}
