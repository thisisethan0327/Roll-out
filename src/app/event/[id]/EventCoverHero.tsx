/**
 * Cover Story B — full-bleed cover hero with a masthead-style title + an
 * "issue bar", replacing the old plain-h1 hero markup. Pure presentation:
 * every prop is data the page already computed (or a purely derived label,
 * e.g. the issue line from the event's own code/date) — no event-specific
 * copy is hardcoded, so this renders correctly for any event.
 *
 * Bebas Neue is loaded here via next/font/google and used ONLY for the
 * masthead title — scoped to this component (a CSS variable applied to the
 * title element), never touching the site's global JetBrains Mono / Inter
 * type system.
 */
import Link from 'next/link';
import { Bebas_Neue } from 'next/font/google';
import { HeroParallax } from '@/components/motion/HeroParallax';
import { Countdown } from './Countdown';
import { PosterModeSwitch } from './PosterModeSwitch';
import styles from './cover-story.module.css';

/**
 * Responsive sources for a poster, by convention only: an asset shipped at
 * …/events/<slug>/cover.webp has a 900px-wide twin at cover-900.webp next to
 * it. Any other pinned URL (a host upload) gets no srcset — just its src.
 */
function posterSrcSet(url: string): string | undefined {
    const m = url.match(/^(.*\/events\/[^/?#]+\/)cover\.webp$/);
    return m ? `${m[1]}cover-900.webp 900w, ${url} 1520w` : undefined;
}

const bebasNeue = Bebas_Neue({
    weight: '400',
    subsets: ['latin'],
    display: 'swap',
});

export type HostChip = { name: string; handle: string | null };

export function EventCoverHero({
    title,
    code,
    isOfficial,
    sectorCode,
    lat,
    lng,
    coverUrl,
    isCancelled,
    dateLabel,
    locationName,
    hostName,
    hostHandle,
    hostVerified,
    coHostChips,
    tags,
    startAt,
    rsvpOpen,
    issueLine,
    posterUrl,
}: {
    title: string;
    code: string | null;
    isOfficial: boolean;
    sectorCode: string | null;
    lat: number | null;
    lng: number | null;
    coverUrl: string;
    isCancelled: boolean;
    dateLabel: string;
    locationName: string;
    hostName: string;
    hostHandle: string;
    hostVerified: boolean;
    coHostChips: HostChip[];
    tags: string[];
    startAt: string | null;
    rsvpOpen: boolean;
    /** e.g. "ISSUE · MEET · 10.10.2026" — derived from real fields, never fabricated. */
    issueLine: string;
    /** A custom pinned hero image (never one of our default covers) → poster
     *  mode; null keeps the full-bleed hero. Decided by the page. */
    posterUrl: string | null;
}) {
    const heroBg = `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.94) 100%), url(${coverUrl}) center/cover no-repeat`;

    const titleBlock = (
        <>
                    <div className={styles.mastheadBar}>
                        <span className={styles.issueLine}>{issueLine}</span>
                        <span className={styles.barcode}>ROLLOUT ／ロールアウト</span>
                    </div>

                    <div className={styles.heroContent} style={{ marginTop: 28 }}>
                        <div className={styles.kickerRow}>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 'var(--track-wide)', textTransform: 'uppercase', color: 'var(--gold)', fontSize: 12 }}>
                                {code ?? 'MEET'} · {isOfficial ? 'OFFICIAL' : 'COMMUNITY MEET'}
                            </span>
                            {sectorCode ? (
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wide)', color: 'var(--text-2)', textTransform: 'uppercase' }}>
                                    ■ {sectorCode}
                                    {lat != null && lng != null
                                        ? ` · ${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? 'E' : 'W'}`
                                        : ''}
                                </span>
                            ) : null}
                        </div>

                        <h1
                            className={`${styles.mastheadTitle} ${bebasNeue.className}`}
                            // Inline on purpose: globals.css's `h1, h2, h3, h4` rule sets the
                            // site font on every h1, and the earlier var(--font-masthead)
                            // reference was undefined (only .variable defines it), so the
                            // title fell back to Inter. next/font's own family string wins.
                            style={{ fontFamily: `${bebasNeue.style.fontFamily}, Impact, 'Arial Narrow', sans-serif`, fontWeight: 400 }}
                        >
                            {title}
                        </h1>

                        <div className={styles.coverDeck}>
                            {dateLabel} · {locationName}
                        </div>

                        {hostName ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wide)', color: 'var(--text-2)', textTransform: 'uppercase' }}>
                                    HOSTED BY
                                </span>
                                {hostVerified ? (
                                    <span className={styles.verifiedPill}>
                                        {hostHandle ? (
                                            <Link href={`/u/${hostHandle}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                                @{hostHandle}
                                            </Link>
                                        ) : (
                                            hostName
                                        )}
                                        <span className={styles.checkDot}>✓</span>
                                    </span>
                                ) : hostHandle ? (
                                    <Link href={`/u/${hostHandle}`} className="accent" style={{ textDecoration: 'none', fontFamily: 'var(--font-display)', fontSize: 12 }}>
                                        @{hostHandle}
                                    </Link>
                                ) : (
                                    <span className="accent" style={{ fontFamily: 'var(--font-display)', fontSize: 12 }}>{hostName}</span>
                                )}
                                {coHostChips.map((c) => (
                                    <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontSize: 12 }}>
                                        <span style={{ opacity: 0.6 }}>×</span>
                                        {c.handle ? (
                                            <Link href={`/u/${c.handle}`} className="accent" style={{ textDecoration: 'none' }}>
                                                @{c.handle}
                                            </Link>
                                        ) : (
                                            <span className="accent">{c.name}</span>
                                        )}
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        {tags.length > 0 ? (
                            <div className={styles.tagRow}>
                                {tags.slice(0, 8).map((tag) => (
                                    <span key={tag} className={styles.tagChip}>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        {startAt && rsvpOpen ? (
                            <div style={{ marginTop: 6 }}>
                                <Countdown startAt={startAt} />
                            </div>
                        ) : null}
                    </div>
        </>
    );

    const fullBleed = (
        <HeroParallax>
            <section
                className={`corner-wrap on-dark ${styles.page}`}
                style={{
                    position: 'relative',
                    minHeight: 520,
                    overflow: 'hidden',
                    background: '#050505',
                    borderBottom: '1px solid var(--line)',
                    filter: isCancelled ? 'grayscale(0.5)' : undefined,
                }}
            >
                <div data-parallax style={{ position: 'absolute', zIndex: 0, background: heroBg, inset: '0 0 -12% 0' }} />
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />

                <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 28, paddingBottom: 40, maxWidth: 1100 }}>
                    {titleBlock}
                </div>
            </section>
        </HeroParallax>
    );

    if (!posterUrl) return fullBleed;

    // POSTER MODE — a custom pinned image (usually a flyer/poster) is shown
    // WHOLE, never cropped, framed like a magazine on a stand, over a blurred
    // + darkened copy of itself. PosterModeSwitch falls back to the
    // full-bleed hero above if the image turns out to be landscape.
    const srcSet = posterSrcSet(posterUrl);
    // The blurred backdrop only needs a small source: reuse the 900w twin
    // when there is one, so phones don't fetch the full-size file twice.
    const backdropUrl = srcSet ? posterUrl.replace(/cover\.webp$/, 'cover-900.webp') : posterUrl;
    const poster = (
        <section
            className={`on-dark ${styles.page} ${styles.posterHero}`}
            style={{ filter: isCancelled ? 'grayscale(0.5)' : undefined }}
        >
            <div aria-hidden="true" className={styles.posterBackdrop} style={{ backgroundImage: `url(${backdropUrl})` }} />
            <div className={`container ${styles.posterGrid}`} style={{ maxWidth: 1100 }}>
                <figure className={styles.posterFigure}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- host-pinned art, same plain-<img> approach as the rest of this page */}
                    <img
                        data-poster
                        src={posterUrl}
                        srcSet={srcSet}
                        sizes={srcSet ? '(min-width: 901px) 460px, calc(100vw - 32px)' : undefined}
                        alt={`${title} poster`}
                        className={styles.posterImg}
                        fetchPriority="high"
                    />
                </figure>
                <div className={styles.posterCopy}>{titleBlock}</div>
            </div>
        </section>
    );

    return <PosterModeSwitch poster={poster} fallback={fullBleed} />;
}
