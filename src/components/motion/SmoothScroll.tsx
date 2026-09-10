'use client';

/**
 * Lenis smooth scroll, driving GSAP's ScrollTrigger — UNITY's setup, ported.
 *
 * Mounted once in the root layout. lerp .09 / smoothWheel, Lenis' raf hooked to
 * gsap.ticker with lagSmoothing off (the same clock for scroll and tweens, or
 * pinned scenes stutter). Skipped entirely under prefers-reduced-motion: the
 * page then scrolls natively and every scene renders its end state.
 *
 * Touch devices keep native scrolling (Lenis' default) — momentum on phones is
 * the OS's job, and the run-12 phone lanes measured overflow with the old CSS
 * alone; adding a scroll hijack there would be a regression, not a feature.
 */
import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/lib/motion/gsap';

export function SmoothScroll() {
    useEffect(() => {
        if (prefersReducedMotion()) return;
        const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        const tick = (t: number) => lenis.raf(t * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        return () => {
            gsap.ticker.remove(tick);
            lenis.destroy();
        };
    }, []);
    return null;
}
