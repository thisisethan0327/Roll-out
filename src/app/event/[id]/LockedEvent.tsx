/**
 * "Visible but locked" /event/[id] — what a stranger sees for a private or
 * followers-only event (migrations 088/089).
 *
 * Built ONLY from a rollout.event_teasers row: title, date, host and a general
 * area. The page never loads the full events row for this viewer, so there is
 * no description, venue, route, attendee list or RSVP control to leak — and
 * nothing here may take one. Server component; no client JS.
 *
 * Glide: one card with the tricolore edge — a lock chip, the title, Date and
 * General area rows, the locked copy and the two ways on.
 */
import Link from 'next/link';
import { BadgeCheck, CalendarDays, Lock, MapPin, Search } from 'lucide-react';
import { formatEventTime } from '@/lib/event-time';
import {
    teaserAreaLabel,
    teaserBadge,
    teaserLockedCopy,
    type EventTeaser,
} from '@/lib/event-teaser-format';
import { Card, Chip, GlideButton, Row, SecButton } from '@/components/glide/primitives';
import '@/components/glide-tickets/tickets.css';

function formatDate(iso: string | null, timeZone: string | null): string {
    if (!iso) return 'Date TBA';
    try {
        return formatEventTime(iso, timeZone);
    } catch {
        return 'Date TBA';
    }
}

/** "PRIVATE EVENT" → "Private event". */
function sentence(s: string): string {
    const t = s.trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
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
    const ic = { size: 22, strokeWidth: 1.5, 'aria-hidden': true } as const;

    return (
        <div className="glide glide-page">
            <div className="g-wrap">
                <Card as="section" edge className="gt-locked" aria-labelledby="locked-title">
                    <div className="g-chips">
                        <Chip large tint icon={<Lock size={15} strokeWidth={2} aria-hidden="true" />}>
                            {sentence(teaserBadge(teaser.visibility))}
                        </Chip>
                    </div>
                    <h1 id="locked-title">{teaser.title ?? 'Private event'}</h1>
                    {hostLabel ? (
                        <p className="g-host">
                            <span>Hosted by</span>
                            {handle ? <Link href={`/u/${handle}`}>@{handle}</Link> : hostLabel}
                            {handle && teaser.host_is_verified ? (
                                <BadgeCheck size={17} strokeWidth={2} role="img" aria-label="Verified host" />
                            ) : null}
                        </p>
                    ) : null}

                    <ul className="g-rows">
                        <Row icon={<CalendarDays {...ic} />} label={formatDate(teaser.start_at, teaser.time_zone)} sub="Date" />
                        <Row icon={<MapPin {...ic} />} label={teaserAreaLabel(teaser.general_area)} sub="General area" />
                    </ul>

                    <p>{teaserLockedCopy(teaser.visibility, handle)}</p>

                    <div className="gt-locked-acts">
                        {!signedIn ? (
                            <GlideButton href={signInHref} plain>
                                Sign in
                            </GlideButton>
                        ) : null}
                        <SecButton href="/meets">
                            <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                            Browse public meets
                        </SecButton>
                    </div>
                </Card>
            </div>
        </div>
    );
}
