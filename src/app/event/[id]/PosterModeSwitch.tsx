'use client';
/**
 * Poster-mode guard for the event cover hero. The server renders POSTER mode
 * for any custom pinned hero image (see EventCoverHero); this reads the
 * natural size of the poster <img> it actually rendered (data-poster, so no
 * second download) and, if the image turns out to be landscape (w >= h),
 * swaps to the regular full-bleed hero instead.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function PosterModeSwitch({ poster, fallback }: { poster: ReactNode; fallback: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [landscape, setLandscape] = useState(false);

    useEffect(() => {
        const img = ref.current?.querySelector<HTMLImageElement>('img[data-poster]');
        if (!img) return;
        const check = () => {
            if (img.naturalWidth > 0 && img.naturalWidth >= img.naturalHeight) setLandscape(true);
        };
        if (img.complete) {
            check();
            return;
        }
        img.addEventListener('load', check, { once: true });
        return () => img.removeEventListener('load', check);
    }, []);

    if (landscape) return <>{fallback}</>;
    return <div ref={ref}>{poster}</div>;
}
