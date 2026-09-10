'use client';

/**
 * The cheap reveal layer, ported from UNITY (reveal-controller.tsx): every
 * element carrying `.rv` gets `.in` when 12% of it enters the viewport, once.
 * The transition itself is CSS (globals.css `.rv` / `.rv.in`, with nth-child
 * stagger), so this component is only the observer.
 *
 * Re-arms on client navigation (pathname) and on DOM mutations, so content
 * that streams in after hydration — the meets list, store grids — is revealed
 * too, and nothing that already has `.in` is ever re-hidden.
 *
 * Under prefers-reduced-motion the CSS shows everything statically; this still
 * adds `.in` so any script keyed on it behaves the same.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function RevealController() {
    const pathname = usePathname();
    useEffect(() => {
        const root = document.body;
        let io: IntersectionObserver | null = null;
        const show = (el: Element) => el.classList.add('in');

        if (!('IntersectionObserver' in window)) {
            root.querySelectorAll('.rv:not(.in)').forEach(show);
            return;
        }
        io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        show(e.target);
                        io?.unobserve(e.target);
                    }
                }
            },
            { threshold: 0.12 },
        );
        const arm = () => root.querySelectorAll('.rv:not(.in)').forEach((el) => io!.observe(el));
        arm();
        const mo = new MutationObserver((muts) => {
            for (const m of muts) {
                m.addedNodes.forEach((n) => {
                    if (!(n instanceof HTMLElement)) return;
                    if (n.classList.contains('rv') && !n.classList.contains('in')) io!.observe(n);
                    n.querySelectorAll?.('.rv:not(.in)').forEach((el) => io!.observe(el));
                });
            }
        });
        mo.observe(root, { childList: true, subtree: true });
        return () => {
            mo.disconnect();
            io?.disconnect();
        };
    }, [pathname]);
    return null;
}
