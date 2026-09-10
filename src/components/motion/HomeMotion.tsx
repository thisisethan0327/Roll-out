'use client';

/**
 * The home page's scroll story — Copper Map, static-hero edition.
 *
 * Wraps the server-rendered hero + stat band and runs one gsap.context scoped
 * to that root, reverted on unmount. Targets are data attributes the page
 * marks, never class names shared with styling:
 *
 *   [data-hero]        the hero section — PINNED for one viewport (+100%,
 *                      scrub .6, 60% on phones) while the story plays
 *   [data-hero-img]    the photo layer — scale 1.08 → 1 over the pin
 *   [data-hero-word]   the wordmark — split into .w spans, wiped in by
 *                      clip-path left → right
 *   [data-hero-copy]   tagline, spec strip, CTAs — fade in on load, fade up
 *                      and out over the last third of the pin
 *   [data-count]       stat numbers — count from 0 once at top 85%,
 *                      data-pad for zero-padding (0042)
 *
 * Reduced motion: nothing pins, nothing scrubs, words are visible, numbers are
 * final. The page is exactly the static build then, which is also what the OG
 * card and any crawler sees.
 *
 * Lifted from UNITY's engine.ts (hero pin + tags + counters) with the HEAL,
 * films and road scenes left behind — those are UNITY's product story.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap, ScrollTrigger, prefersReducedMotion, splitWords } from '@/lib/motion/gsap';

export function HomeMotion({ children }: { children: ReactNode }) {
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = root.current;
        if (!el) return;
        const reduced = prefersReducedMotion();
        const mobile = window.innerWidth <= 900;

        const ctx = gsap.context(() => {
            const hero = el.querySelector<HTMLElement>('[data-hero]');
            const img = el.querySelector<HTMLElement>('[data-hero-img]');
            const word = el.querySelector<HTMLElement>('[data-hero-word]');
            const copy = Array.from(el.querySelectorAll<HTMLElement>('[data-hero-copy]'));
            const counters = Array.from(el.querySelectorAll<HTMLElement>('[data-count]'));

            // ── counters: static value under reduced motion, else count once ──
            counters.forEach((c) => {
                const to = parseFloat(c.dataset.count ?? '0');
                const pad = parseInt(c.dataset.pad ?? '0', 10);
                const fmt = (v: number) => String(Math.round(v)).padStart(pad, '0');
                if (reduced) {
                    c.textContent = fmt(to);
                    return;
                }
                const o = { v: 0 };
                c.textContent = fmt(0);
                gsap.to(o, {
                    v: to,
                    duration: 1.6,
                    ease: 'power2.out',
                    scrollTrigger: { trigger: c, start: 'top 85%', once: true },
                    onUpdate: () => {
                        c.textContent = fmt(o.v);
                    },
                });
            });

            if (!hero || reduced) return;

            // ── load-in: word wipe, then copy ──
            const words = word ? splitWords(word) : [];
            gsap.set(words, { clipPath: 'inset(0 100% 0 0)' });
            const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            intro
                .to(words, { clipPath: 'inset(0 0% 0 0)', duration: 1.1, stagger: 0.12 }, 0.1)
                .from(copy, { opacity: 0, y: 16, duration: 0.8, stagger: 0.1 }, 0.5);

            // ── the pin: photo settles, copy lifts away over the last third ──
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: hero,
                    start: 'top top',
                    end: mobile ? '+=60%' : '+=100%',
                    pin: true,
                    scrub: 0.6,
                    anticipatePin: 1,
                },
            });
            if (img) tl.fromTo(img, { scale: 1.08 }, { scale: 1, duration: 2, ease: 'none' }, 0);
            tl.to(copy, { opacity: 0, y: -30, duration: 0.6, stagger: 0.04 }, 1.4);
            if (word) tl.to(word, { opacity: 0.85, y: -10, duration: 0.6 }, 1.4);

            // Photos and fonts change layout after hydration; re-measure once they land.
            const refresh = () => ScrollTrigger.refresh();
            window.addEventListener('load', refresh);
            document.fonts?.ready.then(refresh).catch(() => {});
            return () => window.removeEventListener('load', refresh);
        }, el);

        return () => ctx.revert();
    }, []);

    return <div ref={root}>{children}</div>;
}
