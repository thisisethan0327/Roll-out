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
import { EmptyRow } from '@/app/me/ui';
import { formatEventTime } from '@/lib/event-time';
import Link from 'next/link';
import { BandReveal } from '@/components/motion/BandReveal';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCover, coverFocus } from '@/lib/event-covers';
import { loadUpcomingTeasers } from '@/lib/event-teasers';
import { getEventIdsWithAnnouncements } from '@/lib/announcements';
import { UpdatePill } from '@/components/AnnouncementBar';
import {
    mergeByStartAt,
    teaserAreaLabel,
    teaserShortBadge,
    toLockedMeet,
    type LockedMeet,
    type TeaserVisibility,
} from '@/lib/event-teaser-format';
import { loadMapData } from './mapData';
import { MeetsSplit } from './MeetsSplit';

// Read at request time: the map loader uses the runtime-only service-role key.
export const dynamic = 'force-dynamic';

const EVENT_TYPES = ['CAR_MEET', 'CRUISE', 'SHOW', 'TRACK_DAY', 'NIGHT_RUN'] as const;
type EventType = (typeof EVENT_TYPES)[number];

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

function formatDate(iso: string | null, tz?: string | null): string {
    if (!iso) return 'TBA';
    try {
        return formatEventTime(iso, tz);
    } catch {
        return 'TBA';
    }
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
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

export default async function MeetsDirectoryPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const [{ upcoming, past }, mapData] = await Promise.all([loadMeets(type), loadMapData(type)]);
    // One query: which upcoming meets have a live announcement (UPDATE pill).
    const updateIds = await getEventIdsWithAnnouncements(upcoming.filter((m) => !isLocked(m)).map((m) => m.id));
    const mapHref = type ? `/meets/map?type=${type}` : '/meets/map';

    return (
        <>
            {/* HERO */}
            <BandReveal>
            <section className="hero-band" data-band="meets">
                <div className="container" style={{ paddingTop: 64, paddingBottom: 48 }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ MEETS</div>
                    <h1 data-band-title style={{ fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: 1, margin: 0 }}>
                        UPCOMING CAR MEETS
                    </h1>
                    <p data-band-copy style={{ fontSize: 16, marginTop: 14, maxWidth: 600 }}>
                        Night runs, car meets, track days, cruises, and shows from shops and the community across the platform.
                    </p>
                </div>
            </section>
            </BandReveal>

            {/* FILTER STRIP + VIEW TOGGLE */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 5 }}>
                <div
                    className="container"
                    style={{ paddingTop: 14, paddingBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <FilterChip href="/meets" label="ALL" active={!type} />
                        {EVENT_TYPES.map((t) => (
                            <FilterChip
                                key={t}
                                href={`/meets?type=${t}`}
                                label={TYPE_LABEL[t].toUpperCase()}
                                active={type === t}
                            />
                        ))}
                    </div>
                    {/* View toggle — mobile/tablet only; desktop shows the split. */}
                    <div className="meets-view-toggle" style={{ display: 'flex', gap: 8 }}>
                        <span
                            style={{
                                padding: '8px 14px',
                                border: '1px solid var(--gold)',
                                background: 'var(--gold)',
                                color: 'var(--bg-0, #000)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 11,
                                letterSpacing: 'var(--track-wider)',
                            }}
                        >
                            LIST
                        </span>
                        <FilterChip href={mapHref} label="MAP ▸" active={false} />
                    </div>
                </div>
            </section>

            {/* UPCOMING */}
            <section className="section" style={{ padding: '48px 0' }}>
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ UPCOMING</div>
                    {upcoming.length === 0 ? (
                        <EmptyRow text={`No upcoming ${type ? TYPE_LABEL[type].toLowerCase() + ' ' : ''}meets right now — open the map or host one.`} art="empty-meets" />
                    ) : (
                        <>
                            {/* Desktop (≥1024): list + live map side by side, cross-highlighting. */}
                            <div className="meets-split-desktop">
                                <MeetsSplit meets={upcoming} events={mapData.events} shops={mapData.shops} updateIds={Array.from(updateIds)} />
                            </div>
                            {/* Mobile/tablet (<1024): classic grid; the map lives at /meets/map. */}
                            <div className="meets-grid-mobile">
                                {upcoming.map((m) =>
                                    isLocked(m) ? <LockedTile key={m.id} m={m} /> : <MeetTile key={m.id} m={m} hasUpdate={updateIds.has(m.id)} />,
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* PAST */}
            {past.length > 0 ? (
                <section className="section" style={{ padding: '0 0 56px' }}>
                    <div className="container">
                        <div className="eyebrow mb-4" style={{ color: 'var(--text-3)' }}>／ PAST MEETS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, opacity: 0.72 }}>
                            {past.map((m) => (
                                <MeetTile key={m.id} m={m} past />
                            ))}
                        </div>
                    </div>
                </section>
            ) : null}
        </>
    );
}

function MeetTile({ m, past = false, hasUpdate = false }: { m: MeetCard; past?: boolean; hasUpdate?: boolean }) {
    return (
        <Link href={`/event/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <article
                className="feature-card corner-wrap"
                style={{ padding: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />
                <div
                    style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        background: `url(${resolveCover(m.hero_image_url, m.type, m.id)}) ${coverFocus(m.hero_image_url)}/cover no-repeat`,
                        borderBottom: '1px solid var(--line)',
                        filter: past ? 'grayscale(0.4)' : undefined,
                    }}
                />
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div className="mono-row" style={{ fontSize: 10 }}>
                        <span className="accent">{m.code ?? m.type ?? 'MEET'}</span>
                        {past ? (
                            <>
                                <span className="sep" />
                                <span style={{ color: 'var(--text-3)' }}>ENDED</span>
                            </>
                        ) : m.is_official ? (
                            <>
                                <span className="sep" />
                                <span className="accent">OFFICIAL</span>
                            </>
                        ) : null}
                        {m.privacy ? (
                            <>
                                <span className="sep" />
                                <span className="accent">🔒 PRIVATE</span>
                            </>
                        ) : null}
                        {m.sector_code ? (
                            <>
                                <span className="sep" />
                                <span>{m.sector_code}</span>
                            </>
                        ) : null}
                    </div>
                    <h3 style={{ fontSize: 18, letterSpacing: 0.8, margin: 0, color: 'var(--text)' }}>
                        {(m.title ?? 'Untitled meet').toUpperCase()}{hasUpdate ? <> <UpdatePill /></> : null}
                    </h3>
                    <div className="text-dim" style={{ fontSize: 13 }}>
                        {formatDate(m.start_at, m.time_zone)} · {m.location_name ?? 'TBA'}
                    </div>
                    {m.description ? (
                        <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                            {truncate(m.description, 120)}
                        </p>
                    ) : null}
                    <div className="mono-row" style={{ fontSize: 10, marginTop: 'auto', paddingTop: 8 }}>
                        <span><span className="accent">●</span> {m.attending_count ?? 0} GOING</span>
                        {!past && m.spots_left != null ? (
                            <>
                                <span className="sep" />
                                <span>{m.spots_left} SPOTS</span>
                            </>
                        ) : null}
                        {m.host_handle ? (
                            <>
                                <span className="sep" />
                                <span>@{m.host_handle}</span>
                            </>
                        ) : null}
                    </div>
                </div>
            </article>
        </Link>
    );
}

/**
 * A locked private / followers-only meet: date, title, badge, general area and
 * host — built from event_teasers only. No photo (a dark lock placeholder), no
 * venue, no attendee count. Still links to /event/[id], which shows the same
 * locked teaser (or the full page, for a viewer who may open it).
 */
function LockedTile({ m }: { m: LockedMeet }) {
    return (
        <Link href={`/event/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <article
                className="feature-card corner-wrap"
                style={{ padding: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />
                <div
                    aria-hidden="true"
                    style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        background: 'radial-gradient(circle at 50% 45%, rgba(255,183,51,0.08), rgba(0,0,0,0) 60%), var(--bg-2)',
                        borderBottom: '1px solid var(--line)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 34,
                    }}
                >
                    🔒
                </div>
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div className="mono-row" style={{ fontSize: 10 }}>
                        <span className="accent">🔒 {teaserShortBadge(m.visibility).toUpperCase()}</span>
                    </div>
                    <h3 style={{ fontSize: 18, letterSpacing: 0.8, margin: 0, color: 'var(--text)' }}>
                        {(m.title ?? 'Private event').toUpperCase()}
                    </h3>
                    <div className="text-dim" style={{ fontSize: 13 }}>
                        {formatDate(m.start_at, m.time_zone)} · {teaserAreaLabel(m.general_area)}
                    </div>
                    <div className="mono-row" style={{ fontSize: 10, marginTop: 'auto', paddingTop: 8 }}>
                        {m.viewer_can_view ? <span className="accent">YOU&apos;RE INVITED ›</span> : <span>INVITE ONLY</span>}
                        {m.host_handle ? (
                            <>
                                <span className="sep" />
                                <span>@{m.host_handle}</span>
                            </>
                        ) : null}
                    </div>
                </div>
            </article>
        </Link>
    );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
    return (
        <Link
            href={href}
            style={{
                padding: '8px 14px',
                border: '1px solid var(--gold)',
                background: active ? 'var(--gold)' : 'transparent',
                color: active ? 'var(--bg-0, #000)' : 'var(--gold)',
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                letterSpacing: 'var(--track-wider)',
                textDecoration: 'none',
            }}
        >
            {label}
        </Link>
    );
}
