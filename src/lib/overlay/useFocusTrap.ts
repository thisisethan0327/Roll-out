'use client';
/**
 * Focus handling every modal overlay shares: focus moves in on open (the
 * `initial` element, or the first focusable one), Tab and Shift+Tab stay
 * inside the panel, and focus returns to whatever opened it on close.
 */
import { useEffect, useRef, type RefObject } from 'react';

export const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where a Modal / Drawer puts focus on open: the `selector` when given;
 * otherwise, with a mouse, the first field in the body (`.g-ov-body`), and
 * on a touch screen the panel itself, so the on-screen keyboard doesn't jump
 * over the form before the person has read it.
 */
export function overlayInitialFocus(panel: HTMLElement | null, selector?: string): HTMLElement | null {
    if (!panel) return null;
    if (selector) return panel.querySelector<HTMLElement>(selector);
    const fine = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
    if (!fine) return panel;
    // A field first (not an (i) tip or a link above it), then any control.
    return (
        panel.querySelector<HTMLElement>('.g-ov-body :is(input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]))') ??
        panel.querySelector<HTMLElement>(`.g-ov-body :is(${FOCUSABLE})`)
    );
}

export function useFocusTrap(
    panelRef: RefObject<HTMLElement | null>,
    active: boolean,
    initial?: () => HTMLElement | null | undefined,
) {
    const initialRef = useRef(initial);
    initialRef.current = initial;
    useEffect(() => {
        if (!active) return undefined;
        const returnTo = document.activeElement as HTMLElement | null;
        // After paint, so the panel's children are in the DOM.
        const t = window.setTimeout(() => {
            const panel = panelRef.current;
            if (!panel || panel.contains(document.activeElement)) return;
            const el = initialRef.current?.() ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
            el.focus?.();
        }, 0);
        const onKey = (e: KeyboardEvent) => {
            const panel = panelRef.current;
            if (e.key !== 'Tab' || !panel) return;
            // Only the topmost trap acts: a confirm opened over this panel owns Tab.
            if (!panel.contains(document.activeElement) && document.activeElement !== document.body) {
                const top = document.activeElement?.closest('[aria-modal="true"]');
                if (top && top !== panel) return;
            }
            const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (!panel.contains(document.activeElement)) {
                e.preventDefault();
                first.focus();
            } else if (e.shiftKey && document.activeElement === first) {
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
            // Only hand focus back if it is still inside (or lost to <body>).
            const panel = panelRef.current;
            const ae = document.activeElement;
            if (!ae || ae === document.body || (panel && panel.contains(ae)) || !ae.isConnected) returnTo?.focus?.();
        };
    }, [active, panelRef]);
}
