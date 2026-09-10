'use client';

/**
 * One place that registers GSAP plugins, so ScrollTrigger is registered exactly
 * once per bundle and every motion component imports the same instance.
 *
 * Ported from UNITY's storefront (src/modules/home/uc/engine.ts): gsap ^3.15 +
 * ScrollTrigger, driven by Lenis (see SmoothScroll.tsx). Everything that
 * animates on scroll must live inside a gsap.context() scoped to a root
 * element and revert on unmount, or it leaks across client navigations.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

if (typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
}

/** True when the visitor asked for less motion. Every scene becomes static. */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return true;
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/** Split an element's text into word spans (.w) for staggered reveals. Idempotent. */
export function splitWords(el: HTMLElement): HTMLElement[] {
    if (el.dataset.split === '1') return Array.from(el.querySelectorAll<HTMLElement>('.w'));
    const text = el.textContent ?? '';
    el.textContent = '';
    const out: HTMLElement[] = [];
    text.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
            el.appendChild(document.createTextNode(' '));
            return;
        }
        const w = document.createElement('span');
        w.className = 'w';
        w.textContent = part;
        el.appendChild(w);
        out.push(w);
    });
    el.dataset.split = '1';
    return out;
}

export { gsap, ScrollTrigger, MotionPathPlugin };
