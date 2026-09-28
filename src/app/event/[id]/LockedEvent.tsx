/**
 * "Visible but locked" /event/[id] — what a stranger sees for a private or
 * followers-only event (migrations 088/089).
 *
 * Built ONLY from a rollout.event_teasers row: title, date, host and a general
 * area. The page never loads the full events row for this viewer, so there is
 * no description, venue, route, attendee list or RSVP control to leak — and
 * nothing here may take one. Server component; no client JS.
 */
import Link from 'next/link';
import { formatEventTime } from '@/lib/event-time';
import {
    teaserAreaLabel,
    teaserBadge,
    teaserLockedCopy,
    type EventTeaser,
} from '@/lib/event-teaser-format';
import styles from './cover-story.module.css';

function formatDate(iso: string | null, timeZone: string | null): string {
    if (!iso) return 'Date TBA';
    try {
        return formatEventTime(iso, timeZone);
    } catch {
        return 'Date TBA';
    }
}

export function LockedEvent({
    teaser,
    signedIn,
    signInHref,
}: {
    teaser: EventTeaser;
    signedIn: boolean;
    /** /login?next=<this path incl. ?invite> — only rendered when signed out. */
    signInHref: string;
}) {
    const handle = teaser.host_handle;
    const hostLabel = handle ? `@${handle}` : teaser.host_name ?? teaser.shop_name ?? null;

    return (
        <div className={styles.page}>
            <section className={styles.lockedHero}>
                <div className="container">
                    <div className={styles.lockedInner}>
                        <div className={styles.kickerRow}>
                            <span className={styles.lockedBadge}>{teaserBadge(teaser.visibility)}</span>
                        </div>
                        <h1 className={styles.lockedTitle}>{(teaser.title ?? 'Private event').toUpperCase()}</h1>
                        {hostLabel ? (
                            <div className={styles.coverDeck}>
                                Hosted by{' '}
                                {handle ? (
                                    <Link href={`/u/${handle}`} className={styles.pillLink} style={{ color: 'var(--gold)' }}>
                                        @{handle}
                                        {teaser.host_is_verified ? ' ✓' : ''}
                                    </Link>
                                ) : (
                                    <span>{hostLabel}</span>
                                )}
                            </div>
                        ) : null}

                        <div className={styles.heroMeta}>
                            <div className={styles.heroMetaItem}>
                                <span className={styles.heroMetaLabel}>Date</span>
                                <span className={styles.heroMetaValue}>{formatDate(teaser.start_at, teaser.time_zone)}</span>
                            </div>
                            <div className={styles.heroMetaItem}>
                                <span className={styles.heroMetaLabel}>General area</span>
                                <span className={styles.heroMetaValue}>{teaserAreaLabel(teaser.general_area)}</span>
                            </div>
                        </div>

                        <p className={styles.lockedCopy}>{teaserLockedCopy(teaser.visibility, handle)}</p>

                        <div className={styles.lockedActions}>
                            {!signedIn ? (
                                <a className="btn btn-lg" href={signInHref}>
                                    SIGN IN ›
                                </a>
                            ) : null}
                            <Link className="btn btn-ghost btn-lg" href="/meets">
                                BROWSE PUBLIC MEETS ›
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
