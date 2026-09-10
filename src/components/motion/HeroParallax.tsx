'use client';

/**
 * Event hero parallax (6F): the photo layer [data-parallax] drifts −12% of its
 * height over the first viewport of scroll, scrubbed, while the hero's copy
 * stays put. The layer is oversized by 12% at the bottom (inset: 0 0 -12%) so
 * the drift never reveals the ground behind it.
 *
 * Scoped gsap.context on the wrapper, reverted on unmount; nothing under
 * reduced motion.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap, prefersReducedMotion } from '@/lib/motion/gsap';

export function HeroParallax({ children }: { children: ReactNode }) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = root.current;
        if (!el || prefersReducedMotion()) return;
        const ctx = gsap.context(() => {
            const layer = el.querySelector<HTMLElement>('[data-parallax]');
            if (!layer) return;
            gsap.to(layer, {
                yPercent: -12,
                ease: 'none',
                scrollTrigger: { trigger: el, start: 'top top', end: '+=100%', scrub: true },
            });
        }, el);
        return () => ctx.revert();
    }, []);
    return <div ref={root}>{children}</div>;
}
