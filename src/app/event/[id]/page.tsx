/**
 * /event/[id] — public event page for shareable links + SEO.
 *
 * Only public, non-cancelled events render (others 404). Read-only: RSVP happens
 * in the app, so the primary CTA deep-links to the Rollout app. Includes JSON-LD
 * Event structured data so meets are indexable + rich-previewable.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { Countdown } from './Countdown';

type EventCard = {
    id: string;
    code: string | null;
    type: string | null;
    title: string | null;
    description: string | null;
    location_name: string | null;
    location_detail: string | null;
    lat: number | null;
    lng: number | null;
    sector_code: string | null;
    hero_image_url: string | null;
    start_at: string | null;
    capacity: number | null;
    attending_count: number | null;
    visibility: string | null;
    is_official: boolean | null;
    spots_left: number | null;
    host_handle: string | null;
    host_name: string | null;
    host_is_verified: boolean | null;
    tags: string[] | null;
};

type Attendee = {
    profile_id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
};

async function loadEvent(id: string): Promise<{ event: EventCard; attendees: Attendee[] } | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const supabase = getSupabaseAdmin();
    const { data: evRaw } = await supabase.from('event_cards').select('*').eq('id', id).maybeSingle();
    const ev = evRaw as EventCard | null;
    if (!ev || ev.visibility !== 'public') return null;

    // Pull a short attendee list for the "convoy" strip. Going-only, newest first.
    const { data: rsvpRaw } = await supabase
        .from('event_rsvps')
        .select('profile_id, rsvped_at, profile:profiles!event_rsvps_profile_id_fkey(handle, display_name, avatar_url)')
        .eq('event_id', id)
        .eq('status', 'going')
        .order('rsvped_at', { ascending: false })
        .limit(12);

    const attendees: Attendee[] = ((rsvpRaw as any[]) ?? [])
        .map((r) => ({
            profile_id: r.profile_id,
            handle: r.profile?.handle ?? '',
            display_name: r.profile?.display_name ?? r.profile?.handle ?? 'Member',
            avatar_url: r.profile?.avatar_url ?? null,
        }))
        .filter((a) => a.handle);

    return { event: ev, attendees };
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return 'Date TBA';
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Los_Angeles',
        }) + ' PT';
    } catch {
        return 'Date TBA';
    }
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function initials(name: string, handle: string): string {
    const src = (name?.trim() || handle || '·').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Calendar helpers — no API key, no client JS needed.
function toCalDate(iso: string): string {
    // Convert to UTC YYYYMMDDTHHmmssZ (Google + ICS spec).
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) + 'Z'
    );
}
function googleCalUrl(ev: EventCard): string | null {
    if (!ev.start_at) return null;
    const start = toCalDate(ev.start_at);
    // Default to 3-hour duration since end_at isn't in the schema.
    const endIso = new Date(new Date(ev.start_at).getTime() + 3 * 3600_000).toISOString();
    const end = toCalDate(endIso);
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: ev.title ?? 'Car meet',
        dates: `${start}/${end}`,
        details: (ev.description ?? '') + `\n\nhttps://rollout.club/event/${ev.id}`,
        location: ev.location_name ?? '',
    });
    return `https://www.google.com/calendar/render?${params.toString()}`;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const data = await loadEvent(id);
    if (!data) return { title: 'Event not found' };
    const { event: ev } = data;

    const title = `${ev.title ?? 'Car meet'} · Rollout`;
    const desc = ev.description
        ? truncate(ev.description, 160)
        : `${ev.type ?? 'Meet'} at ${ev.location_name ?? 'TBA'} — ${formatDate(ev.start_at)}. RSVP on Rollout.`;
    const images = ev.hero_image_url ? [ev.hero_image_url] : ['/images/og-rollout.jpg'];

    return {
        title,
        description: desc,
        openGraph: { title, description: desc, images, type: 'website' },
        twitter: { card: 'summary_large_image', title, description: desc, images },
    };
}

export default async function PublicEventPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const data = await loadEvent(id);
    if (!data) notFound();
    const { event: ev, attendees } = data;

    const hostHandle = ev.host_handle ?? '';
    const heroBg = ev.hero_image_url
        ? `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.92) 100%), url(${ev.hero_image_url}) center/cover no-repeat`
        : 'radial-gradient(ellipse at top, var(--gold-dim) 0%, transparent 60%), linear-gradient(180deg, #0a0a0a 0%, #000 100%)';

    // OpenStreetMap embed — no API key, free. Build a tight bbox around the point.
    const mapEmbedUrl =
        ev.lat != null && ev.lng != null
            ? (() => {
                  const d = 0.006;
                  const bbox = [ev.lng - d, ev.lat - d, ev.lng + d, ev.lat + d].join(',');
                  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${ev.lat},${ev.lng}`;
              })()
            : null;
    const mapsUrl =
        ev.lat != null && ev.lng != null
            ? `https://www.google.com/maps?q=${ev.lat},${ev.lng}`
            : null;

    const calUrl = googleCalUrl(ev);
    const remaining = attendees.length < (ev.attending_count ?? 0)
        ? (ev.attending_count ?? 0) - attendees.length
        : 0;

    // JSON-LD structured data for search engines.
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.title ?? 'Car meet',
        startDate: ev.start_at ?? undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
            '@type': 'Place',
            name: ev.location_name ?? 'TBA',
            ...(ev.lat != null && ev.lng != null
                ? { geo: { '@type': 'GeoCoordinates', latitude: ev.lat, longitude: ev.lng } }
                : {}),
        },
        ...(ev.hero_image_url ? { image: [ev.hero_image_url] } : {}),
        ...(ev.description ? { description: ev.description } : {}),
        ...(ev.host_name ? { organizer: { '@type': 'Organization', name: ev.host_name } } : {}),
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* HERO — HUD chrome with corner brackets + countdown + tags */}
            <section
                className="corner-wrap"
                style={{
                    position: 'relative',
                    minHeight: 440,
                    background: heroBg,
                    borderBottom: '1px solid var(--line)',
                }}
            >
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />

                {/* Top-left readout — sector + coords */}
                <div
                    style={{
                        position: 'absolute',
                        top: 18,
                        left: 18,
                        zIndex: 2,
                        padding: '8px 12px',
                        border: '1px solid var(--line-mid)',
                        background: 'rgba(0,0,0,0.6)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--gold)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <span style={{ width: 5, height: 5, background: 'var(--gold)', display: 'inline-block' }} />
                    {ev.sector_code ?? 'SECTOR 06'}
                    {ev.lat != null && ev.lng != null ? (
                        <>
                            <span style={{ color: 'var(--text-3)' }}>·</span>
                            <span style={{ color: 'var(--text-2)' }}>
                                {Math.abs(ev.lat).toFixed(3)}°{ev.lat >= 0 ? 'N' : 'S'} ·{' '}
                                {Math.abs(ev.lng).toFixed(3)}°{ev.lng >= 0 ? 'E' : 'W'}
                            </span>
                        </>
                    ) : null}
                </div>

                {/* Top-right readout — code + tier */}
                <div
                    style={{
                        position: 'absolute',
                        top: 18,
                        right: 18,
                        zIndex: 2,
                        padding: '8px 12px',
                        border: '1px solid var(--line-mid)',
                        background: 'rgba(0,0,0,0.6)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--text-2)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <span className="accent">{ev.code ?? ev.type ?? 'MEET'}</span>
                    <span style={{ color: 'var(--text-3)' }}>·</span>
                    <span className="accent">{ev.is_official ? 'OFFICIAL' : 'COMMUNITY MEET'}</span>
                </div>

                <div
                    className="container"
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        paddingTop: 100,
                        paddingBottom: 56,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 18,
                        maxWidth: 1100,
                    }}
                >
                    <h1
                        style={{
                            fontSize: 'clamp(32px, 6vw, 64px)',
                            letterSpacing: 1,
                            lineHeight: 1.05,
                            margin: 0,
                            maxWidth: 900,
                        }}
                    >
                        {(ev.title ?? 'Car meet').toUpperCase()}
                    </h1>

                    <div className="mono-row" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text)' }}>{formatDate(ev.start_at)}</span>
                        <span className="sep" />
                        <span>{ev.location_name ?? 'Location TBA'}</span>
                        {ev.host_name ? (
                            <>
                                <span className="sep" />
                                <span>HOSTED BY</span>
                                {hostHandle ? (
                                    <Link href={`/u/${hostHandle}`} className="accent" style={{ textDecoration: 'none' }}>
                                        @{hostHandle}
                                    </Link>
                                ) : (
                                    <span className="accent">{ev.host_name}</span>
                                )}
                                {ev.host_is_verified ? <span className="accent">✓</span> : null}
                            </>
                        ) : null}
                    </div>

                    {ev.tags && ev.tags.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {ev.tags.slice(0, 8).map((tag) => (
                                <span
                                    key={tag}
                                    style={{
                                        padding: '4px 10px',
                                        border: '1px solid var(--line-mid)',
                                        background: 'rgba(0,0,0,0.4)',
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 10,
                                        letterSpacing: 'var(--track-wider)',
                                        color: 'var(--text-2)',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    {ev.start_at ? (
                        <div style={{ marginTop: 12 }}>
                            <Countdown startAt={ev.start_at} />
                        </div>
                    ) : null}
                </div>
            </section>

            {/* STAT BAR */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ padding: 0 }}>
                    <div className="stat-band" style={{ gridTemplateColumns: 'repeat(3, 1fr)', border: 'none', margin: 0 }}>
                        <div className="stat-cell">
                            <div className="lbl">Attending</div>
                            <div className="val accent">{ev.attending_count ?? 0}</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Capacity</div>
                            <div className="val">{ev.capacity ?? '—'}</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Spots Left</div>
                            <div className="val">{ev.spots_left ?? '—'}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTAs — RSVP + Add to Calendar */}
            <section className="section" style={{ padding: '48px 0', textAlign: 'center' }}>
                <div className="container">
                    <a className="btn btn-lg" href={`https://rollout.club/sign-in-on-phone?next=/event/${ev.id}`}>
                        RSVP in the App
                    </a>
                    <p
                        className="text-muted"
                        style={{
                            fontSize: 11,
                            marginTop: 14,
                            fontFamily: 'var(--font-display)',
                            letterSpacing: 'var(--track-wider)',
                        }}
                    >
                        OPEN ROLLOUT TO RSVP + GET DIRECTIONS
                    </p>
                    {calUrl ? (
                        <div style={{ marginTop: 14 }}>
                            <a
                                href={calUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-link"
                                style={{
                                    fontSize: 12,
                                    fontFamily: 'var(--font-display)',
                                    letterSpacing: 'var(--track-wider)',
                                    textDecoration: 'none',
                                    borderBottom: '1px solid var(--line-mid)',
                                    paddingBottom: 2,
                                }}
                            >
                                + ADD TO GOOGLE CALENDAR
                            </a>
                        </div>
                    ) : null}
                </div>
            </section>

            {/* CONVOY — attendee preview */}
            {(attendees.length > 0 || (ev.attending_count ?? 0) > 0) ? (
                <section className="section" style={{ padding: '40px 0', borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                    <div className="container">
                        <div className="eyebrow eyebrow-gold mb-4">／ CONVOY</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                            <h2 style={{ margin: 0 }}>WHO&apos;S GOING</h2>
                            <span className="mono-row" style={{ fontSize: 11 }}>
                                <span className="accent">●</span>
                                <span>{ev.attending_count ?? 0} CONFIRMED</span>
                            </span>
                        </div>

                        {attendees.length === 0 ? (
                            <p className="text-dim">
                                {ev.attending_count ?? 0} attending. Open the app to see who&apos;s in.
                            </p>
                        ) : (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                    gap: 12,
                                }}
                            >
                                {attendees.map((a) => (
                                    <Link
                                        key={a.profile_id}
                                        href={`/u/${a.handle}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '10px 12px',
                                            background: 'var(--bg-2)',
                                            border: '1px solid var(--line)',
                                            textDecoration: 'none',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: '50%',
                                                background: a.avatar_url
                                                    ? `url(${a.avatar_url}) center/cover no-repeat`
                                                    : 'var(--bg-3)',
                                                border: '1px solid var(--gold)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontFamily: 'var(--font-display)',
                                                fontWeight: 700,
                                                fontSize: 11,
                                                color: 'var(--gold)',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {!a.avatar_url && initials(a.display_name, a.handle)}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div
                                                style={{
                                                    color: 'var(--text)',
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 12,
                                                    letterSpacing: 0.5,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                @{a.handle}
                                            </div>
                                            <div
                                                style={{
                                                    color: 'var(--text-3)',
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 9,
                                                    letterSpacing: 'var(--track-wider)',
                                                    marginTop: 2,
                                                }}
                                            >
                                                GOING
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                                {remaining > 0 ? (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '10px 12px',
                                            border: '1px dashed var(--line-mid)',
                                            background: 'transparent',
                                            color: 'var(--gold)',
                                            fontFamily: 'var(--font-display)',
                                            fontSize: 11,
                                            letterSpacing: 'var(--track-wider)',
                                        }}
                                    >
                                        +{remaining} MORE
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </section>
            ) : null}

            {/* BRIEF + HOST */}
            {(ev.description || ev.host_name) ? (
                <section className="section" style={{ padding: '48px 0', borderTop: '1px solid var(--line)' }}>
                    <div className="container container-narrow">
                        {ev.description ? (
                            <>
                                <div className="eyebrow eyebrow-gold mb-4">／ BRIEF</div>
                                <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>{ev.description}</p>
                            </>
                        ) : null}

                        {ev.host_name ? (
                            <>
                                <div className="eyebrow eyebrow-gold mb-4">／ HOSTED BY</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div
                                        style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: '50%',
                                            background: 'var(--bg-3)',
                                            border: '1px solid var(--gold)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontFamily: 'var(--font-display)',
                                            fontWeight: 700,
                                            color: 'var(--gold)',
                                            fontSize: 14,
                                        }}
                                    >
                                        {initials(ev.host_name, hostHandle)}
                                    </div>
                                    <div>
                                        {hostHandle ? (
                                            <Link
                                                href={`/u/${hostHandle}`}
                                                style={{
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 16,
                                                    color: 'var(--text)',
                                                    textDecoration: 'none',
                                                    letterSpacing: 0.5,
                                                }}
                                            >
                                                {ev.host_name}{ev.host_is_verified ? ' ✓' : ''}
                                            </Link>
                                        ) : (
                                            <span style={{ fontSize: 16 }}>{ev.host_name}</span>
                                        )}
                                        {hostHandle ? (
                                            <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>@{hostHandle}</div>
                                        ) : null}
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {/* LOCATION — title + map embed */}
            <section className="section" style={{ padding: '48px 0', borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ LOCATION</div>
                    <h2 style={{ margin: '0 0 8px' }}>{(ev.location_name ?? 'TBA').toUpperCase()}</h2>
                    {ev.location_detail ? (
                        <p className="text-dim" style={{ fontSize: 14, margin: '0 0 18px' }}>{ev.location_detail}</p>
                    ) : null}

                    {mapEmbedUrl ? (
                        <div
                            className="corner-wrap"
                            style={{
                                position: 'relative',
                                marginTop: 12,
                                aspectRatio: '16 / 7',
                                background: 'var(--bg-2)',
                                border: '1px solid var(--line)',
                                overflow: 'hidden',
                            }}
                        >
                            <span className="corner-bottom-left" />
                            <span className="corner-bottom-right" />
                            <iframe
                                src={mapEmbedUrl}
                                title="Event location map"
                                style={{ width: '100%', height: '100%', border: 0, filter: 'grayscale(0.6) sepia(0.3) saturate(1.4) brightness(0.85)' }}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        </div>
                    ) : null}

                    {mapsUrl ? (
                        <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <a
                                className="text-link"
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    fontSize: 12,
                                    fontFamily: 'var(--font-display)',
                                    letterSpacing: 'var(--track-wider)',
                                    textDecoration: 'none',
                                    borderBottom: '1px solid var(--line-mid)',
                                    paddingBottom: 2,
                                }}
                            >
                                OPEN IN GOOGLE MAPS ›
                            </a>
                        </div>
                    ) : null}
                </div>
            </section>
        </>
    );
}
