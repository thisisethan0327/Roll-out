'use client';

/**
 * PDP gallery — clickable, keyboard-accessible thumbnails that swap the main
 * image. Renders through next/image so the optimizer serves resized WebP/AVIF
 * instead of the raw multi-MB catalog PNGs. Preserves the corner-wrap framing,
 * paused grayscale + COMING SOON veil, and thumbnail-strip layout of the
 * original static gallery.
 */
import { useRef, useState } from 'react';
import Image from 'next/image';

type Props = {
    images: string[];
    title: string;
    paused: boolean;
};

export function ProductGallery({ images, title, paused }: Props) {
    const [active, setActive] = useState(0);
    const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const pausedFilter = paused ? 'grayscale(0.85) brightness(0.6)' : 'none';
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* MAIN IMAGE */}
            <div
                className="corner-wrap"
                style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    background: 'var(--bg-3)',
                    border: '1px solid var(--line)',
                    overflow: 'hidden',
                }}
            >
                {main ? (
                    <Image
                        key={main}
                        src={main}
                        alt={`${title} — image ${active + 1} of ${images.length}`}
                        fill
                        priority
                        sizes="(max-width: 900px) 100vw, 50vw"
                        style={{ objectFit: 'cover', filter: pausedFilter }}
                    />
                ) : null}
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />
                {paused ? (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: 13,
                                fontWeight: 700,
                                letterSpacing: 'var(--track-wider)',
                                padding: '8px 18px',
                                border: '1px solid var(--gold)',
                                background: 'rgba(0,0,0,0.72)',
                                color: 'var(--gold)',
                            }}
                        >
                            COMING SOON
                        </span>
                    </div>
                ) : null}
            </div>

            {/* THUMBNAILS */}
            {hasThumbs ? (
                <div
                    role="group"
                    aria-label="Product image thumbnails"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}
                >
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
                                style={{
                                    position: 'relative',
                                    aspectRatio: '1 / 1',
                                    padding: 0,
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    background: 'var(--bg-3)',
                                    border: `1px solid ${isActive ? 'var(--gold)' : 'var(--line)'}`,
                                    boxShadow: isActive ? '0 0 0 1px var(--gold)' : 'none',
                                    opacity: isActive ? 1 : 0.78,
                                    transition: 'opacity 120ms ease, border-color 120ms ease',
                                }}
                            >
                                <Image
                                    src={img}
                                    alt=""
                                    fill
                                    loading="lazy"
                                    sizes="72px"
                                    style={{ objectFit: 'cover', filter: pausedFilter }}
                                />
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
