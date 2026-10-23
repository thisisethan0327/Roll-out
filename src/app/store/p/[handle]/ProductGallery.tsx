'use client';

/**
 * PDP gallery — clickable, keyboard-accessible thumbnails that swap the main
 * image. Renders through next/image so the optimizer serves resized WebP/AVIF
 * instead of the raw multi-MB catalog PNGs. A paused product keeps its
 * greyed photo and a "Coming soon" pill over it.
 *
 * Glide: the photo on a rounded tile inside a card, thumbnails as rounded
 * tiles with an accent ring on the one shown.
 */
import { useRef, useState } from 'react';
import Image from 'next/image';
import { Clock, Package } from 'lucide-react';

type Props = {
    images: string[];
    title: string;
    paused: boolean;
};

export function ProductGallery({ images, title, paused }: Props) {
    const [active, setActive] = useState(0);
    const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const main = images[active] ?? images[0] ?? null;
    const hasThumbs = images.length > 1;

    // Arrow-key navigation across the thumbnail strip (roving selection).
    const onThumbKeyDown = (e: React.KeyboardEvent, i: number) => {
        let next: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % images.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + images.length) % images.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = images.length - 1;
        if (next !== null) {
            e.preventDefault();
            setActive(next);
            thumbRefs.current[next]?.focus();
        }
    };

    return (
        <div className="g-card gt-gal">
            {/* MAIN IMAGE */}
            <div className={`gt-gal-main${paused ? ' is-paused' : ''}`}>
                {main ? (
                    <Image
                        key={main}
                        src={main}
                        alt={`${title} — image ${active + 1} of ${images.length}`}
                        fill
                        priority
                        sizes="(max-width: 900px) 100vw, 50vw"
                    />
                ) : (
                    <span className="gt-pc-ph" aria-hidden="true">
                        <Package size={56} strokeWidth={1.2} />
                    </span>
                )}
                {paused ? (
                    <span className="gt-gal-veil g-fp">
                        <Clock size={18} strokeWidth={2} aria-hidden="true" />
                        Coming soon
                    </span>
                ) : null}
            </div>

            {/* THUMBNAILS */}
            {hasThumbs ? (
                <div role="group" aria-label="Product image thumbnails" className="gt-gal-thumbs">
                    {images.map((img, i) => {
                        const isActive = i === active;
                        return (
                            <button
                                key={img}
                                type="button"
                                ref={(el) => {
                                    thumbRefs.current[i] = el;
                                }}
                                onClick={() => setActive(i)}
                                onKeyDown={(e) => onThumbKeyDown(e, i)}
                                aria-label={`View image ${i + 1} of ${images.length}`}
                                aria-pressed={isActive}
                            >
                                <Image
                                    src={img}
                                    alt=""
                                    fill
                                    loading="lazy"
                                    sizes="72px"
                                    style={paused ? { filter: 'grayscale(0.85) brightness(0.75)' } : undefined}
                                />
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
