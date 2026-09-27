'use client';

/**
 * Start every NEW page at the top.
 *
 * Next's App Router only scrolls to the top when the new segment's first
 * element is out of view — and on routes with a loading.tsx it makes that
 * check against the short skeleton, which is always "in view". The real page
 * then streams in under the old scroll offset (browser scroll anchoring keeps
 * it there), so clicking into the _NAC Run page from the bottom of /meets
 * landed near the bottom. A refresh was fine, which hid it.
 *
 * Back/forward (popstate) is left alone so the browser/Next restore where the
 * reader was, and so are #hash links.
 */
import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

let poppedState = false;
if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        poppedState = true;
    });
}

export function RouteScrollReset() {
    const pathname = usePathname();
    const first = useRef(true);

    useLayoutEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        if (poppedState) {
            poppedState = false;
            return;
        }
        if (window.location.hash) return;
        // Lenis (SmoothScroll) keeps its own scroll target; jump it too, or it
        // animates straight back to the old offset.
        const lenis = (window as unknown as { __lenis?: { scrollTo: (t: number, o: object) => void } }).__lenis;
        if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
        window.scrollTo(0, 0);
    }, [pathname]);

    return null;
}
