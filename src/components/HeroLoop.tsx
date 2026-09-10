'use client';

/**
 * The ambient loop over the hero still (UI polish §8). Mounts a muted,
 * looping, inline video only when the flag is on, the viewport is desktop
 * (≥ 901px, hover-capable) and the visitor has not asked for reduced motion;
 * fades in once the first frame can play, so the still is what everyone sees
 * first and what phones and crawlers see always.
 */
import { useEffect, useState } from 'react';
import { HERO_AMBIENT_LOOP, HERO_LOOP_MP4, HERO_LOOP_WEBM } from '@/lib/hero-media';

export function HeroLoop() {
    const [on, setOn] = useState(false);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!HERO_AMBIENT_LOOP) return;
        try {
            const desktop = window.matchMedia('(min-width: 901px) and (hover: hover)').matches;
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            setOn(desktop && !reduced);
        } catch {
            setOn(false);
        }
    }, []);
    if (!on) return null;
    return (
        <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            onCanPlay={() => setReady(true)}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '62% 50%',
                opacity: ready ? 1 : 0,
                transition: 'opacity 1.2s ease',
                pointerEvents: 'none',
            }}
        >
            <source src={HERO_LOOP_WEBM} type="video/webm" />
            <source src={HERO_LOOP_MP4} type="video/mp4" />
        </video>
    );
}
