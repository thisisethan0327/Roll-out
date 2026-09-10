'use client';

/**
 * The home page's scroll story (UI polish §7, engine ported from the archived
 * copper-map branch; the look is unchanged — only the motion is new).
 *
 * Targets are data attributes the page marks, never styling classes:
 *   [data-hero]       the hero section — PINNED for one viewport (+100%,
 *                     scrub .6; +60% on phones) while the story plays
 *   [data-hero-img]   the photo layer — settles 1.06 → 1 over the pin
 *   [data-hero-word]  the wordmark — split into .w spans, wiped in on arrival
 *   [data-hero-copy]  tagline, spec strip, CTAs — fade in on arrival, lift
 *                     away over the last third of the pin
 *   [data-count]      stat numbers — count from 0 once at top 85%; data-pad
 *                     zero-pads ("07"); a non-numeric value (the dash a failed
 *                     read shows) is left exactly as rendered
 *
 * Reduced motion: nothing pins, nothing scrubs, words are visible, numbers are
 * final — the page is the static build.
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

            counters.forEach((c) => {
                const raw = c.dataset.count ?? '';
                const to = parseFloat(raw);
                if (!Number.isFinite(to)) return; // "—": leave the rendered text alone
                const pad = parseInt(c.dataset.pad ?? '0', 10);
                const fmt = (v: number) => String(Math.round(v)).padStart(pad, '0');
                if (reduced) return; // the server rendered the final value already
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
                    onComplete: () => {
                        c.textContent = fmt(to);
                    },
                });
            });

            if (!hero || reduced) return;

            const words = word ? splitWords(word) : [];
            gsap.set(words, { clipPath: 'inset(0 100% 0 0)' });
            gsap.timeline({ defaults: { ease: 'power3.out' } })
                .to(words, { clipPath: 'inset(0 0% 0 0)', duration: 1.1, stagger: 0.12 }, 0.1)
                .from(copy, { opacity: 0, y: 16, duration: 0.8, stagger: 0.1 }, 0.5);

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
            if (img) tl.fromTo(img, { scale: 1.06 }, { scale: 1, duration: 2, ease: 'none' }, 0);
            tl.to(copy, { opacity: 0, y: -30, duration: 0.6, stagger: 0.04 }, 1.4);
            if (word) tl.to(word, { opacity: 0.85, y: -10, duration: 0.6 }, 1.4);

            const refresh = () => ScrollTrigger.refresh();
            window.addEventListener('load', refresh);
            document.fonts?.ready.then(refresh).catch(() => {});
            return () => window.removeEventListener('load', refresh);
        }, el);

        return () => ctx.revert();
    }, []);

    return <div ref={root}>{children}</div>;
}
