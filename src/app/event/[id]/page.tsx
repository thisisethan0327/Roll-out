/**
 * /event/[id] — public event page for shareable links + SEO.
 *
 * Only public, non-cancelled events render (others 404). Read-only: RSVP happens
 * in the app, so the CTA deep-links to the Rollout app. Includes JSON-LD Event
 * structured data so meets are indexable + rich-previewable.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
};

async function loadEvent(id: string): Promise<EventCard | null> {
    // UUID guard — bad ids shouldn't hit the DB.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('event_cards').select('*').eq('id', id).maybeSingle();
    const ev = data as EventCard | null;
    // Public page only exposes public events (event_cards already excludes cancelled).
    if (!ev || ev.visibility !== 'public') return null;
    return ev;
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

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const ev = await loadEvent(id);
    if (!ev) return { title: 'Event not found' };

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
    const ev = await loadEvent(id);
    if (!ev) notFound();

    const hostHandle = ev.host_handle ?? '';
    const heroBg = ev.hero_image_url
        ? `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.9) 100%), url(${ev.hero_image_url}) center/cover no-repeat`
        : 'linear-gradient(135deg, var(--gold) 0%, #000 100%)';

    const mapsUrl =
        ev.lat != null && ev.lng != null
            ? `https://www.google.com/maps?q=${ev.lat},${ev.lng}`
            : null;

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

            {/* HERO */}
            <section style={{ position: 'relative', minHeight: 360, background: heroBg, borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 72, paddingBottom: 48 }}>
                    <div className="mono-row" style={{ color: 'var(--text-2)', marginBottom: 12 }}>
                        <span className="accent">{ev.code ?? ev.type ?? 'MEET'}</span>
                        {ev.is_official ? (
                            <>
                                <span className="sep" />
                                <span className="accent">OFFICIAL</span>
                            </>
                        ) : (
                            <>
                                <span className="sep" />
                                <span>COMMUNITY MEET</span>
                            </>
                        )}
                        {ev.sector_code ? (
                            <>
                                <span className="sep" />
                                <span>{ev.sector_code}</span>
                            </>
                        ) : null}
                    </div>
                    <h1 style={{ fontSize: 'clamp(28px, 5vw, 52px)', letterSpacing: 1, margin: 0, maxWidth: 760 }}>
                        {(ev.title ?? 'Car meet').toUpperCase()}
                    </h1>
                    <p style={{ color: 'var(--text-2)', fontSize: 16, marginTop: 14 }}>
                        {formatDate(ev.start_at)} · {ev.location_name ?? 'Location TBA'}
                    </p>
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

            {/* CTA */}
            <section className="section" style={{ padding: '48px 0', textAlign: 'center' }}>
                <div className="container">
                    <a className="btn btn-lg" href={`https://rollout.club/sign-in-on-phone?next=/event/${ev.id}`}>
                        RSVP in the App
                    </a>
                    <p className="text-muted" style={{ fontSize: 11, marginTop: 14, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)' }}>
                        OPEN ROLLOUT TO RSVP + GET DIRECTIONS
                    </p>
                </div>
            </section>

            {/* DETAILS */}
            <section className="section" style={{ padding: '48px 0', borderTop: '1px solid var(--line)' }}>
                <div className="container container-narrow">
                    {ev.host_name ? (
                        <div style={{ marginBottom: 28 }}>
                            <div className="eyebrow eyebrow-gold mb-4">／ HOSTED BY</div>
                            {hostHandle ? (
                                <Link href={`/u/${hostHandle}`} className="text-link" style={{ fontSize: 18 }}>
                                    {ev.host_name}{ev.host_is_verified ? ' ✓' : ''}
                                </Link>
                            ) : (
                                <span style={{ fontSize: 18 }}>{ev.host_name}</span>
                            )}
                        </div>
                    ) : null}

                    {ev.description ? (
                        <div style={{ marginBottom: 28 }}>
                            <div className="eyebrow eyebrow-gold mb-4">／ BRIEF</div>
                            <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.7 }}>{ev.description}</p>
                        </div>
                    ) : null}

                    <div className="eyebrow eyebrow-gold mb-4">／ LOCATION</div>
                    <p style={{ fontSize: 16, color: 'var(--text)', margin: '0 0 4px' }}>{ev.location_name ?? 'TBA'}</p>
                    {ev.location_detail ? <p className="text-dim" style={{ fontSize: 14, margin: 0 }}>{ev.location_detail}</p> : null}
                    {mapsUrl ? (
                        <a className="text-link" href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13 }}>
                            View on map ›
                        </a>
                    ) : null}
                </div>
            </section>
        </>
    );
}
