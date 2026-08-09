/**
 * /meets — public directory of upcoming car meets across the platform.
 *
 * Lists every public, non-cancelled, upcoming event from event_cards (cross-shop
 * now that migration 020 opened up the RLS). SEO-targeted so search engines can
 * index the meets index page and individual /event/[id] pages.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const EVENT_TYPES = ['NIGHT_RUN', 'CAR_MEET', 'TRACK_DAY', 'CRUISE', 'SHOW'] as const;
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
    attending_count: number | null;
    capacity: number | null;
    spots_left: number | null;
    is_official: boolean | null;
    host_handle: string | null;
    host_name: string | null;
};

function isValidType(t: string | undefined): t is EventType {
    return !!t && (EVENT_TYPES as readonly string[]).includes(t);
}

const CARD_COLS =
    'id, code, type, title, description, location_name, sector_code, hero_image_url, start_at, attending_count, capacity, spots_left, is_official, host_handle, host_name';

async function loadMeets(
    type: EventType | null,
): Promise<{ upcoming: MeetCard[]; past: MeetCard[] }> {
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

    const [upcomingRes, pastRes] = await Promise.all([upcomingQ, pastQ]);
    return {
        upcoming: ((upcomingRes.data as any[]) ?? []) as MeetCard[],
        past: ((pastRes.data as any[]) ?? []) as MeetCard[],
    };
}

function formatDate(iso: string | null): string {
    if (!iso) return 'TBA';
    try {
        return new Date(iso).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Los_Angeles',
        }) + ' PT';
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
    const title = type ? `${scope} on Rollout` : 'Car Meets & Events · Rollout';
    const desc = type
        ? `Browse upcoming ${TYPE_LABEL[type].toLowerCase()} events near you on Rollout — hosted by local shops and the community.`
        : 'Browse upcoming car meets, night runs, track days, and shows on Rollout — hosted by local shops and the community.';
    return {
        title,
        description: desc,
        openGraph: { title, description: desc, type: 'website' },
        twitter: { card: 'summary_large_image', title, description: desc },
    };
}

export default async function MeetsDirectoryPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const { upcoming, past } = await loadMeets(type);
    const mapHref = type ? `/meets/map?type=${type}` : '/meets/map';

    return (
        <>
            {/* HERO */}
            <section style={{ background: 'linear-gradient(135deg, var(--gold) 0%, #000 60%)', borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ padding: '64px 0 48px' }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ MEETS</div>
                    <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: 1, margin: 0 }}>
                        UPCOMING CAR MEETS
                    </h1>
                    <p style={{ color: 'var(--text-2)', fontSize: 16, marginTop: 14, maxWidth: 600 }}>
                        Night runs, car meets, track days, cruises, and shows from shops and the community across the platform.
                    </p>
                </div>
            </section>

            {/* FILTER STRIP + VIEW TOGGLE */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 5 }}>
                <div
                    className="container"
                    style={{ padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}
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
                    <div style={{ display: 'flex', gap: 8 }}>
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
                        <div className="admin-empty">
                            No upcoming {type ? TYPE_LABEL[type].toLowerCase() + ' ' : ''}meets right now. Check back soon.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                            {upcoming.map((m) => (
                                <MeetTile key={m.id} m={m} />
                            ))}
                        </div>
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

function MeetTile({ m, past = false }: { m: MeetCard; past?: boolean }) {
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
                        background: m.hero_image_url
                            ? `url(${m.hero_image_url}) center/cover no-repeat`
                            : 'linear-gradient(135deg, var(--bg-3), var(--bg-2))',
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
                        {m.sector_code ? (
                            <>
                                <span className="sep" />
                                <span>{m.sector_code}</span>
                            </>
                        ) : null}
                    </div>
                    <h3 style={{ fontSize: 18, letterSpacing: 0.8, margin: 0, color: 'var(--text)' }}>
                        {(m.title ?? 'Untitled meet').toUpperCase()}
                    </h3>
                    <div className="text-dim" style={{ fontSize: 13 }}>
                        {formatDate(m.start_at)} · {m.location_name ?? 'TBA'}
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
