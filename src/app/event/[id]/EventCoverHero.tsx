/**
 * Cover Story B — the event cover hero, modelled on mix-cover-B.html.
 *
 * One DOM tree, two layouts:
 *  - Phone (≤900px), for EVERY event: the cover (poster or default art) is a
 *    full-bleed <img> BEHIND the copy (object-fit: cover, 18% from the top),
 *    under the mockup's scrim, with the copy aligned to the bottom.
 *  - Desktop (≥901px): a default/landscape cover stays the full-bleed
 *    parallax hero; a custom portrait poster (posterUrl) is shown WHOLE beside
 *    the title block over a blurred copy of itself. PosterModeSwitch drops to
 *    the full-bleed variant if the poster turns out landscape.
 *
 * All copy is event data (or labels derived from it) — nothing event-specific
 * is hardcoded. Bebas Neue (next/font, scoped here) is used only for the title.
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

/** Both hero <img>s share one `sizes`, so a browser picks the SAME candidate
 *  for each and the file is only fetched once. */
const HERO_SIZES = '(min-width: 901px) 460px, 100vw';

const bebasNeue = Bebas_Neue({
    weight: '400',
    subsets: ['latin'],
    display: 'swap',
});

export type HostChip = { name: string; handle: string | null };

type Props = {
    title: string;
    code: string | null;
    isOfficial: boolean;
    coverUrl: string;
    isCancelled: boolean;
    /** Full date · time with zone, e.g. "Sat, Oct 10, 2026 · 9:00 AM PDT". */
    dateLabel: string;
    locationName: string;
    /** events.location_detail — rendered as ADDRESS only when present. */
    address: string | null;
    hostName: string;
    hostHandle: string;
    hostVerified: boolean;
    coHostChips: HostChip[];
    tags: string[];
    startAt: string | null;
    rsvpOpen: boolean;
    /** Issue bar line 1, e.g. "VOL. 01 · NO. 10 — OCT 2026 ISSUE" (derived). */
    issueLine: string;
    /** Issue bar line 2, e.g. "ROLLOUT.CLUB / EVENTS / NAC-RUN" (derived). */
    issuePath: string;
    /** A custom pinned hero image (never one of our default covers) → poster
     *  mode on desktop; null keeps the full-bleed hero. Decided by the page. */
    posterUrl: string | null;
};

/** Title with the mockup's gold underscore when it starts with "_". */
function MastheadTitle({ title }: { title: string }) {
    return (
        <h1
            className={`${styles.mastheadTitle} ${bebasNeue.className}`}
            // Inline on purpose: globals.css's `h1, h2, h3, h4` rule sets the
            // site font on every h1; next/font's own family string wins here.
            style={{ fontFamily: `${bebasNeue.style.fontFamily}, Impact, 'Arial Narrow', sans-serif`, fontWeight: 400 }}
        >
            {title.startsWith('_') ? (
                <>
                    <span className={styles.underscore}>_</span>
                    {title.slice(1)}
                </>
            ) : (
                title
            )}
        </h1>
    );
}

export function EventCoverHero(props: Props) {
    const { coverUrl, posterUrl } = props;
    const srcSet = posterUrl ? posterSrcSet(posterUrl) : undefined;

    const masthead = (
        <div className="container" style={{ maxWidth: 1100 }}>
            <div className={styles.mastheadBar}>
                <span className={styles.issueLine}>{props.issueLine}</span>
                <span className={styles.barcode}>{props.issuePath}</span>
            </div>
        </div>
    );

    const fullBleed = (
        <>
            {masthead}
            <HeroParallax>
                <HeroSection {...props} heroSrc={posterUrl ?? coverUrl} srcSet={srcSet} poster={false} />
            </HeroParallax>
        </>
    );

    if (!posterUrl) return fullBleed;

    const poster = (
        <>
            {masthead}
            <HeroParallax>
                <HeroSection {...props} heroSrc={posterUrl} srcSet={srcSet} poster />
            </HeroParallax>
        </>
    );

    return <PosterModeSwitch poster={poster} fallback={fullBleed} />;
}

function HeroSection({
    title,
    code,
    isOfficial,
    isCancelled,
    dateLabel,
    locationName,
    address,
    hostName,
    hostHandle,
    hostVerified,
    coHostChips,
    tags,
    startAt,
    rsvpOpen,
    heroSrc,
    srcSet,
    poster,
}: Props & { heroSrc: string; srcSet: string | undefined; poster: boolean }) {
    // The blurred desktop backdrop only needs a small source: reuse the 900w
    // twin when there is one. (A display:none element's background is never
    // fetched, so phones don't load it at all.)
    const backdropUrl = srcSet ? heroSrc.replace(/cover\.webp$/, 'cover-900.webp') : heroSrc;

    return (
        <section
            className={`on-dark ${styles.page} ${styles.hero} ${poster ? styles.heroPoster : ''}`}
            aria-label={`${title} event cover`}
            style={{ filter: isCancelled ? 'grayscale(0.5)' : undefined }}
        >
            {/* Full-bleed cover (all phones; default/landscape covers on desktop). */}
            <div data-parallax className={styles.heroImgLayer}>
                {/* eslint-disable-next-line @next/next/no-img-element -- same plain-<img> approach as the rest of this page */}
                <img
                    className={styles.heroImg}
                    src={heroSrc}
                    srcSet={srcSet}
                    sizes={srcSet ? HERO_SIZES : undefined}
                    alt=""
                    // PosterModeSwitch reads this one's natural size: it is
                    // the image that loads at every width.
                    data-poster={poster ? '' : undefined}
                    fetchPriority="high"
                />
            </div>
            <div className={styles.scrim} aria-hidden="true" />
            {poster ? (
                <div aria-hidden="true" className={styles.posterBackdrop} style={{ backgroundImage: `url(${backdropUrl})` }} />
            ) : null}

            <div className={`container ${styles.heroInner}`} style={{ maxWidth: 1100 }}>
                {poster ? (
                    <figure className={styles.posterFigure}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            className={styles.posterImg}
                            src={heroSrc}
                            srcSet={srcSet}
                            sizes={srcSet ? HERO_SIZES : undefined}
                            alt={`${title} poster`}
                        />
                    </figure>
                ) : null}

                <div className={styles.heroContent}>
                    <div className={styles.kickerRow}>
                        <span className={styles.kicker}>A Rollout Cover Story</span>
                        {hostName ? (
                            <span className={styles.verifiedPill}>
                                {hostVerified ? <span className={styles.checkDot}>✓</span> : null}
                                HOSTED BY{' '}
                                {hostHandle ? (
                                    <Link href={`/u/${hostHandle}`} className={styles.pillLink}>
                                        @{hostHandle}
                                    </Link>
                                ) : (
                                    hostName
                                )}
                            </span>
                        ) : null}
                        {coHostChips.map((c) => (
                            <span key={c.name} className={styles.verifiedPill}>
                                ×{' '}
                                {c.handle ? (
                                    <Link href={`/u/${c.handle}`} className={styles.pillLink}>
                                        @{c.handle}
                                    </Link>
                                ) : (
                                    c.name
                                )}
                            </span>
                        ))}
                    </div>

                    <MastheadTitle title={title} />

                    <div className={styles.coverDeck}>
                        {code ?? 'MEET'} · {isOfficial ? 'OFFICIAL' : 'COMMUNITY MEET'}
                    </div>

                    <div className={styles.heroMeta}>
                        <div className={styles.heroMetaItem}>
                            <span className={styles.heroMetaLabel}>Date</span>
                            <span className={styles.heroMetaValue}>{dateLabel}</span>
                        </div>
                        <div className={styles.heroMetaItem}>
                            <span className={styles.heroMetaLabel}>Meet</span>
                            <span className={styles.heroMetaValue}>{locationName}</span>
                        </div>
                        {address ? (
                            <div className={styles.heroMetaItem}>
                                <span className={styles.heroMetaLabel}>Address</span>
                                <span className={styles.heroMetaValue}>{address}</span>
                            </div>
                        ) : null}
                    </div>

                    {tags.length > 0 ? (
                        <div className={styles.tagRow} role="list" aria-label="Event tags">
                            {tags.slice(0, 8).map((tag) => (
                                <span key={tag} className={styles.tagChip} role="listitem">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    {startAt && rsvpOpen ? <Countdown startAt={startAt} variant="sticker" /> : null}
                </div>
            </div>
        </section>
    );
}
