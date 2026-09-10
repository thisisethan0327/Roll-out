'use client';

/**
 * Word-by-word reveal for the photo bands at the top of /meets, /shops and
 * /store (6F: "photo band with the word reveal, not pinned").
 *
 * Wraps the server-rendered band; on mount it splits the element marked
 * [data-band-title] into .w spans and wipes them in, then fades the rest of
 * the band's copy ([data-band-copy]) up. Runs once per mount — a page-level
 * entrance, not a scroll scene — and does nothing under reduced motion.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap, prefersReducedMotion, splitWords } from '@/lib/motion/gsap';

export function BandReveal({ children }: { children: ReactNode }) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = root.current;
        if (!el || prefersReducedMotion()) return;
        const ctx = gsap.context(() => {
            const title = el.querySelector<HTMLElement>('[data-band-title]');
            const copy = Array.from(el.querySelectorAll<HTMLElement>('[data-band-copy]'));
            const words = title ? splitWords(title) : [];
            gsap.set(words, { clipPath: 'inset(0 100% 0 0)' });
            gsap.timeline({ defaults: { ease: 'power3.out' } })
                .to(words, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, stagger: 0.08 }, 0.05)
                .from(copy, { opacity: 0, y: 14, duration: 0.7, stagger: 0.08 }, 0.35);
        }, el);
        return () => ctx.revert();
    }, []);
    return <div ref={root}>{children}</div>;
}
