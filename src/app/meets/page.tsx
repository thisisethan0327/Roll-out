/**
 * /meets — public directory of upcoming car meets across the platform.
 *
 * Lists every public, non-cancelled, upcoming event from event_cards (cross-shop
 * now that migration 020 opened up the RLS). SEO-targeted so search engines can
 * index the meets index page and individual /event/[id] pages.
 *
 * Private / followers-only meets are "visible but locked" (migrations
 * 088/089): upcoming rows from rollout.event_teasers join the same date
 * ordering. A viewer who may open one sees its normal card with a PRIVATE
 * badge; everyone else a locked card — date, title, badge, general area and
 * host only (no photo, no venue, no attendee count). Fails soft: no view →
 * no extra cards.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarX2, Flag, Map as MapIcon } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUpcomingTeasers } from '@/lib/event-teasers';
import { getEventIdsWithAnnouncements } from '@/lib/announcements';
import {
    mergeByStartAt,
    toLockedMeet,
    type LockedMeet,
    type TeaserVisibility,
} from '@/lib/event-teaser-format';
import { loadMapData } from './mapData';
import { MeetsSplit } from './MeetsSplit';
import { Card, IconRoundel } from '@/components/glide/primitives';
import { FilterChips, MeetRow, ViewToggle } from '@/components/glide-discover/ui';

// Read at request time: the map loader uses the runtime-only service-role key.
export const dynamic = 'force-dynamic';

const EVENT_TYPES = ['CAR_MEET', 'CRUISE', 'SHOW', 'TRACK_DAY', 'NIGHT_RUN'] as const;
type EventType = (typeof EVENT_TYPES)[number];

/** Chip labels, sentence case. */
const TYPE_LABEL_SHORT: Record<EventType, string> = {
    CAR_MEET: 'Car meets',
    CRUISE: 'Cruises',
    SHOW: 'Shows',
    TRACK_DAY: 'Track days',
    NIGHT_RUN: 'Night runs',
};

const TYPE_LABEL: Record<EventType, string> = {
    NIGHT_RUN: 'Night Run',
    CAR_MEET: 'Car Meet',
    TRACK_DAY: 'Track Day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
};

type MeetCard = {
    id: string;
    code: string | null;
    type: string | null;
    title: string | null;
    description: string | null;
    location_name: string | null;
    sector_code: string | null;
    hero_image_url: string | null;
    start_at: string | null;
    time_zone: string | null;
    attending_count: number | null;
    capacity: number | null;
    spots_left: number | null;
    is_official: boolean | null;
    host_handle: string | null;
    host_name: string | null;
    /** Set on a private / followers-only meet this viewer may open. */
    privacy?: TeaserVisibility | null;
};

type UpcomingItem = MeetCard | LockedMeet;

function isLocked(m: UpcomingItem): m is LockedMeet {
    return (m as LockedMeet).locked === true;
}

function isValidType(t: string | undefined): t is EventType {
    return !!t && (EVENT_TYPES as readonly string[]).includes(t);
}

const CARD_COLS =
    'id, code, type, title, description, location_name, sector_code, hero_image_url, start_at, attending_count, capacity, spots_left, is_official, host_handle, host_name, time_zone';

async function loadMeets(
    type: EventType | null,
): Promise<{ upcoming: UpcomingItem[]; past: MeetCard[] }> {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    let upcomingQ = supabase
        .from('event_cards')
        .select(CARD_COLS)
        .eq('visibility', 'public')
        .gte('start_at', nowIso)
        .order('start_at', { ascending: true })
        .limit(60);
    if (type) upcomingQ = upcomingQ.eq('type', type);

    let pastQ = supabase
        .from('event_cards')
        .select(CARD_COLS)
        .eq('visibility', 'public')
        .lt('start_at', nowIso)
        .order('start_at', { ascending: false })
        .limit(24);
    if (type) pastQ = pastQ.eq('type', type);

    const [upcomingRes, pastRes, privateItems] = await Promise.all([upcomingQ, pastQ, loadPrivateUpcoming(type)]);
    const publicUpcoming = ((upcomingRes.data as any[]) ?? []) as MeetCard[];
    return {
        upcoming: mergeByStartAt(publicUpcoming, privateItems),
        past: ((pastRes.data as any[]) ?? []) as MeetCard[],
    };
}

/**
 * Upcoming private / followers-only meets as list items. Ids the view says
 * this viewer can open get their full event_cards row (service role, those
 * ids only) with a PRIVATE badge; the rest — and any allowed id without a
 * card row — become locked teaser cards built from the view alone.
 */
async function loadPrivateUpcoming(type: EventType | null): Promise<UpcomingItem[]> {
    const teasers = await loadUpcomingTeasers(type);
    if (teasers.length === 0) return [];
    const allowedIds = teasers.filter((t) => t.viewer_can_view).map((t) => t.id);
    const cards = new Map<string, MeetCard>();
    if (allowedIds.length > 0) {
        const { data, error } = await getSupabaseAdmin().from('event_cards').select(CARD_COLS).in('id', allowedIds);
        if (error) console.error('[meets] private event cards load failed:', error.message);
        for (const c of (data as any[]) ?? []) cards.set(c.id, c as MeetCard);
    }
    return teasers.map((t) => {
        const card = t.viewer_can_view ? cards.get(t.id) : undefined;
        return card ? { ...card, privacy: t.visibility } : toLockedMeet(t);
    });
}

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}): Promise<Metadata> {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const scope = type ? TYPE_LABEL[type] : 'Car Meets';
    // The root layout's template appends ' · Rollout' to the page title; the
    // openGraph/twitter titles do not go through it, so they carry it themselves.
    const title = type ? `${scope} on Rollout` : 'Car Meets & Events';
    const socialTitle = `${title} · Rollout`;
    const desc = type
        ? `Browse upcoming ${TYPE_LABEL[type].toLowerCase()} events near you on Rollout — hosted by local shops and the community.`
        : 'Browse upcoming car meets, night runs, track days, and shows on Rollout — hosted by local shops and the community.';
    return {
        title,
        description: desc,
        // One canonical for every filter: the filtered lists are views of it.
        alternates: { canonical: '/meets' },
        openGraph: { title: socialTitle, description: desc, type: 'website', url: '/meets' },
        twitter: { card: 'summary_large_image', title: socialTitle, description: desc },
    };
}

/** Plural headings for a filtered list ("Night runs"). */
const TYPE_PLURAL: Record<EventType, string> = {
    NIGHT_RUN: 'Night runs',
    CAR_MEET: 'Car meets',
    TRACK_DAY: 'Track days',
    CRUISE: 'Cruises',
    SHOW: 'Shows',
};

export default async function MeetsDirectoryPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const [{ upcoming, past }, mapData] = await Promise.all([loadMeets(type), loadMapData(type)]);
    // One query: which upcoming meets have a live announcement (Update pill).
    const updateIds = await getEventIdsWithAnnouncements(upcoming.filter((m) => !isLocked(m)).map((m) => m.id));
    const mapHref = type ? `/meets/map?type=${type}` : '/meets/map';
    const listHref = type ? `/meets?type=${type}` : '/meets';
    const chips = [
        { href: '/meets', label: 'All', current: !type },
        ...EVENT_TYPES.map((t) => ({ href: `/meets?type=${t}`, label: TYPE_LABEL_SHORT[t], current: type === t })),
    ];

    return (
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <header className="gd-head">
                    <div>
                        <h1>{type ? TYPE_PLURAL[type] : 'Meets'}</h1>
                        <p>
                            {upcoming.length > 0 ? (
                                <>
                                    <span className="g-w">{upcoming.length}</span> coming up ·{' '}
                                </>
                            ) : null}
                            Meets, runs, track days, cruises and shows from shops and the community. RSVP right here on the web.
                        </p>
                    </div>
                    <ViewToggle current="list" listHref={listHref} mapHref={mapHref} />
                </header>
                <FilterChips items={chips} label="Event type" />

                {/* UPCOMING */}
                <section className="gd-block" aria-labelledby="meets-upcoming">
                    <h2 id="meets-upcoming" className="g-sr">
                        Upcoming
                    </h2>
                    {upcoming.length === 0 ? (
                        <Card className="gd-empty">
                            <IconRoundel>
                                <CalendarX2 size={21} strokeWidth={1.75} />
                            </IconRoundel>
                            <span style={{ flex: 1 }}>
                                <b>No upcoming {type ? TYPE_PLURAL[type].toLowerCase() : 'meets'} right now</b>
                                Open the map to see shops near you, or host one yourself.
                            </span>
                            <Link href={mapHref} className="g-link">
                                <MapIcon size={16} strokeWidth={2} aria-hidden="true" />
                                Open the map
                            </Link>
                            <Link href="/me/events" className="g-link">
                                <Flag size={16} strokeWidth={2} aria-hidden="true" />
                                Host a meet
                            </Link>
                        </Card>
                    ) : (
                        <MeetsSplit meets={upcoming} events={mapData.events} shops={mapData.shops} updateIds={Array.from(updateIds)} />
                    )}
                </section>

                {/* PAST */}
                {past.length > 0 ? (
                    <section className="gd-block" aria-labelledby="meets-past" style={{ marginTop: 44 }}>
                        <div className="g-sh">
                            <h2 id="meets-past">Past meets</h2>
                        </div>
                        <ul className="gd-past">
                            {past.map((m) => (
                                <li key={m.id}>
                                    <MeetRow m={m} past chevron={false} />
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
