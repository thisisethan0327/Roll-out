/**
 * /event/[id] — public event page for shareable links + SEO, now with web RSVP.
 *
 * Loads from the base rollout.events table (via the service-role client) so
 * PAST and CANCELLED public events still render with the right banner — the
 * event_cards view hides cancelled rows, which is wrong for a shareable link.
 * Only public events render; non-public 404. Logged-in members RSVP inline
 * (RLS-enforced writes); signed-out members get a sign-in CTA that returns here.
 * JSON-LD Event structured data keeps meets indexable + rich-previewable.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getConsumerProfile } from '@/lib/consumer';
import { Countdown } from './Countdown';
import { RsvpControls } from './RsvpControls';
import { ShareBar } from './ShareBar';
import type { RsvpChoice } from './actions';

type EventRow = {
    id: string;
    shop_id: number | null;
    host_id: string | null;
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
    cancelled_at: string | null;
    tags: string[] | null;
    host: { handle: string | null; display_name: string | null; is_verified: boolean | null } | null;
    shop: { slug: string | null } | null;
};

type Attendee = {
    profile_id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadEvent(
    id: string,
): Promise<{ event: EventRow; attendees: Attendee[]; spotsLeft: number | null } | null> {
    if (!UUID_RE.test(id)) return null;
    const supabase = getSupabaseAdmin();
    const { data: evRaw } = await supabase
        .from('events')
        .select(
            `id, shop_id, host_id, code, type, title, description, location_name, location_detail,
             lat, lng, sector_code, hero_image_url, start_at, capacity, attending_count,
             visibility, is_official, cancelled_at, tags,
             host:profiles!events_host_id_fkey(handle, display_name, is_verified),
             shop:shops!events_shop_id_fkey(slug)`,
        )
        .eq('id', id)
        .maybeSingle();

    const ev = evRaw as EventRow | null;
    if (!ev || ev.visibility !== 'public') return null;

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

    const spotsLeft =
        ev.capacity != null ? Math.max(ev.capacity - (ev.attending_count ?? 0), 0) : null;

    return { event: ev, attendees, spotsLeft };
}

/** The signed-in member's current RSVP for this event (or null). */
async function loadMyRsvp(eventId: string): Promise<{ isLoggedIn: boolean; status: RsvpChoice | null }> {
    const me = await getConsumerProfile();
    if (!me) return { isLoggedIn: false, status: null };
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from('event_rsvps')
        .select('status')
        .eq('event_id', eventId)
        .eq('profile_id', me.profileId)
        .maybeSingle();
    const s = (data as any)?.status as string | undefined;
    const status: RsvpChoice | null =
        s === 'going' || s === 'maybe' || s === 'declined' ? s : null;
    return { isLoggedIn: true, status };
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return 'Date TBA';
    try {
        return (
            new Date(iso).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/Los_Angeles',
            }) + ' PT'
        );
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

function toCalDate(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        'Z'
    );
}
function googleCalUrl(ev: EventRow): string | null {
    if (!ev.start_at) return null;
    const start = toCalDate(ev.start_at);
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

    const cancelledPrefix = ev.cancelled_at ? '[Cancelled] ' : '';
    const title = `${cancelledPrefix}${ev.title ?? 'Car meet'} · Rollout`;
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
    const { event: ev, attendees, spotsLeft } = data;
    const { isLoggedIn, status: myStatus } = await loadMyRsvp(id);

    const isCancelled = !!ev.cancelled_at;
    const isPast = !!ev.start_at && new Date(ev.start_at).getTime() < Date.now();
    const rsvpOpen = !isCancelled && !isPast;

    const hostHandle = ev.host?.handle ?? '';
    const hostName = ev.host?.display_name ?? '';
    const hostVerified = !!ev.host?.is_verified;
    const shopSlug = ev.shop?.slug ?? null;

    const heroBg = ev.hero_image_url
        ? `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.92) 100%), url(${ev.hero_image_url}) center/cover no-repeat`
        : 'radial-gradient(ellipse at top, var(--gold-dim) 0%, transparent 60%), linear-gradient(180deg, #0a0a0a 0%, #000 100%)';

    const mapEmbedUrl =
        ev.lat != null && ev.lng != null
            ? (() => {
                  const d = 0.006;
                  const bbox = [ev.lng - d, ev.lat - d, ev.lng + d, ev.lat + d].join(',');
                  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${ev.lat},${ev.lng}`;
              })()
            : null;
    const mapsUrl = ev.lat != null && ev.lng != null ? `https://www.google.com/maps?q=${ev.lat},${ev.lng}` : null;

    const calUrl = rsvpOpen ? googleCalUrl(ev) : null;
    const remaining = attendees.length < (ev.attending_count ?? 0) ? (ev.attending_count ?? 0) - attendees.length : 0;
    const shareUrl = `https://rollout.club/event/${ev.id}`;
    const shareTitle = ev.title ?? 'Car meet on Rollout';

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.title ?? 'Car meet',
        startDate: ev.start_at ?? undefined,
        eventStatus: isCancelled
            ? 'https://schema.org/EventCancelled'
            : 'https://schema.org/EventScheduled',
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
        ...(hostName ? { organizer: { '@type': 'Organization', name: hostName } } : {}),
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

            {/* STATUS BANNER — cancelled or past */}
            {isCancelled ? (
                <div
                    style={{
                        background: 'rgba(200,60,60,0.14)',
                        borderBottom: '1px solid rgba(220,80,80,0.5)',
                        color: '#ff8f8f',
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontFamily: 'var(--font-display)',
                        fontSize: 12,
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    ✕ THIS MEET HAS BEEN CANCELLED
                </div>
            ) : isPast ? (
                <div
                    style={{
                        background: 'var(--bg-2)',
                        borderBottom: '1px solid var(--line)',
                        color: 'var(--text-2)',
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontFamily: 'var(--font-display)',
                        fontSize: 12,
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    ● THIS MEET HAS ENDED · RSVPS ARE CLOSED
                </div>
            ) : null}

            {/* HERO */}
            <section
                className="corner-wrap"
                style={{
                    position: 'relative',
                    minHeight: 440,
                    background: heroBg,
                    borderBottom: '1px solid var(--line)',
                    filter: isCancelled ? 'grayscale(0.5)' : undefined,
                }}
            >
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />

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
                    <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', letterSpacing: 1, lineHeight: 1.05, margin: 0, maxWidth: 900 }}>
                        {(ev.title ?? 'Car meet').toUpperCase()}
                    </h1>

                    <div className="mono-row" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text)' }}>{formatDate(ev.start_at)}</span>
                        <span className="sep" />
                        <span>{ev.location_name ?? 'Location TBA'}</span>
                        {hostName ? (
                            <>
                                <span className="sep" />
                                <span>HOSTED BY</span>
                                {hostHandle ? (
                                    <Link href={`/u/${hostHandle}`} className="accent" style={{ textDecoration: 'none' }}>
                                        @{hostHandle}
                                    </Link>
                                ) : (
                                    <span className="accent">{hostName}</span>
                                )}
                                {hostVerified ? <span className="accent">✓</span> : null}
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

                    {ev.start_at && rsvpOpen ? (
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
                            <div className="val">{spotsLeft ?? '—'}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* RSVP + Calendar + Share */}
            <section className="section" style={{ padding: '48px 0', textAlign: 'center' }}>
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 26, alignItems: 'center' }}>
                    {rsvpOpen ? (
                        <RsvpControls
                            eventId={ev.id}
                            isLoggedIn={isLoggedIn}
                            initialStatus={myStatus}
                            nextPath={`/event/${ev.id}`}
                        />
                    ) : (
                        <p
                            className="text-muted"
                            style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', margin: 0 }}
                        >
                            {isCancelled ? 'THIS MEET WAS CANCELLED' : 'THIS MEET HAS ALREADY HAPPENED'}
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                        {calUrl ? (
                            <a
                                href={calUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-link"
                                style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', textDecoration: 'none', borderBottom: '1px solid var(--line-mid)', paddingBottom: 2 }}
                            >
                                + GOOGLE CALENDAR
                            </a>
                        ) : null}
                        {rsvpOpen ? (
                            <a
                                href={`/event/${ev.id}/ics`}
                                className="text-link"
                                style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', textDecoration: 'none', borderBottom: '1px solid var(--line-mid)', paddingBottom: 2 }}
                            >
                                + DOWNLOAD .ICS
                            </a>
                        ) : null}
                    </div>

                    <ShareBar url={shareUrl} title={shareTitle} />

                    {shopSlug ? (
                        <Link
                            href={`/shop/${shopSlug}/events/${ev.id}`}
                            className="text-link"
                            style={{ fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', textDecoration: 'none', color: 'var(--text-3)' }}
                        >
                            HOST · MANAGE THIS EVENT ›
                        </Link>
                    ) : null}
                </div>
            </section>

            {/* CONVOY — attendee preview */}
            {attendees.length > 0 || (ev.attending_count ?? 0) > 0 ? (
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
                            <p className="text-dim">{ev.attending_count ?? 0} attending.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                                {attendees.map((a) => (
                                    <Link
                                        key={a.profile_id}
                                        href={`/u/${a.handle}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', textDecoration: 'none' }}
                                    >
                                        <div
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: '50%',
                                                background: a.avatar_url ? `url(${a.avatar_url}) center/cover no-repeat` : 'var(--bg-3)',
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
                                            <div style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                @{a.handle}
                                            </div>
                                            <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: 'var(--track-wider)', marginTop: 2 }}>
                                                GOING
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                                {remaining > 0 ? (
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', border: '1px dashed var(--line-mid)', background: 'transparent', color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)' }}
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
            {ev.description || hostName ? (
                <section className="section" style={{ padding: '48px 0', borderTop: '1px solid var(--line)' }}>
                    <div className="container container-narrow">
                        {ev.description ? (
                            <>
                                <div className="eyebrow eyebrow-gold mb-4">／ BRIEF</div>
                                <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>{ev.description}</p>
                            </>
                        ) : null}

                        {hostName ? (
                            <>
                                <div className="eyebrow eyebrow-gold mb-4">／ HOSTED BY</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div
                                        style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-3)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--gold)', fontSize: 14 }}
                                    >
                                        {initials(hostName, hostHandle)}
                                    </div>
                                    <div>
                                        {hostHandle ? (
                                            <Link href={`/u/${hostHandle}`} style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text)', textDecoration: 'none', letterSpacing: 0.5 }}>
                                                {hostName}{hostVerified ? ' ✓' : ''}
                                            </Link>
                                        ) : (
                                            <span style={{ fontSize: 16 }}>{hostName}</span>
                                        )}
                                        {hostHandle ? <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>@{hostHandle}</div> : null}
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {/* LOCATION */}
            <section className="section" style={{ padding: '48px 0', borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ LOCATION</div>
                    <h2 style={{ margin: '0 0 8px' }}>{(ev.location_name ?? 'TBA').toUpperCase()}</h2>
                    {ev.location_detail ? <p className="text-dim" style={{ fontSize: 14, margin: '0 0 18px' }}>{ev.location_detail}</p> : null}

                    {mapEmbedUrl ? (
                        <div className="corner-wrap" style={{ position: 'relative', marginTop: 12, aspectRatio: '16 / 7', background: 'var(--bg-2)', border: '1px solid var(--line)', overflow: 'hidden' }}>
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
                                style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', textDecoration: 'none', borderBottom: '1px solid var(--line-mid)', paddingBottom: 2 }}
                            >
                                OPEN IN GOOGLE MAPS ›
                            </a>
                            <Link
                                className="text-link"
                                href="/meets/map"
                                style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', textDecoration: 'none', borderBottom: '1px solid var(--line-mid)', paddingBottom: 2 }}
                            >
                                VIEW MEETS MAP ›
                            </Link>
                        </div>
                    ) : null}
                </div>
            </section>
        </>
    );
}
