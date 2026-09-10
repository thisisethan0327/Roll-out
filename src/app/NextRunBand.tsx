import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { formatEventTime } from '@/lib/event-time';
import { hasDrawnRoute, snapToSite, ROUTE_ORIGIN } from '@/lib/map-sites';
import { StylisedMap, type MapPin } from '@/components/map/StylisedMap';

/**
 * "／ NEXT RUN" — the map band below the home hero (UI polish §6). The map is
 * the EVENT's, not the brand's: it shows the next upcoming public meet as the
 * featured pin with its real title, time (in its zone), meet point, spot count
 * and RSVP door; the other upcoming meets as pins; verified shops as shop
 * pins; and the drawn route only when the featured event runs it (see
 * lib/map-sites — the _NAC Run today). Renders nothing when there is no
 * upcoming public meet at all.
 */
type Row = {
    id: string;
    title: string | null;
    type: string | null;
    start_at: string | null;
    location_name: string | null;
    location_detail: string | null;
    description: string | null;
    lat: number | null;
    lng: number | null;
    attending_count: number | null;
    capacity: number | null;
    spots_left: number | null;
    host_name: string | null;
    host_handle: string | null;
};

async function loadBand(): Promise<{ featured: Row; others: Row[]; shops: { lat: number; lng: number }[] } | null> {
    try {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();
        const [events, shops] = await Promise.all([
            supabase
                .from('event_cards')
                .select('id, title, type, start_at, location_name, location_detail, description, lat, lng, attending_count, capacity, spots_left, host_name, host_handle')
                .eq('visibility', 'public')
                .gte('start_at', nowIso)
                .order('start_at', { ascending: true })
                .limit(8),
            supabase.from('shops').select('lat, lng').not('lat', 'is', null).not('lng', 'is', null).limit(40),
        ]);
        const rows = (events.data ?? []) as Row[];
        if (rows.length === 0) return null;
        return {
            featured: rows[0],
            others: rows.slice(1),
            shops: ((shops.data ?? []) as { lat: number; lng: number }[]).filter((s) => s.lat != null && s.lng != null),
        };
    } catch {
        return null;
    }
}

const TYPE_LABEL: Record<string, string> = { NIGHT_RUN: 'NIGHT RUN', CAR_MEET: 'CAR MEET', TRACK_DAY: 'TRACK DAY', CRUISE: 'CRUISE', SHOW: 'SHOW' };

export async function NextRunBand() {
    const data = await loadBand();
    if (!data) return null;
    const { featured, others, shops } = data;

    const route = hasDrawnRoute(featured);
    // When the route draws, the featured pin IS the route's origin.
    const site = route ? ROUTE_ORIGIN : snapToSite(featured.lat, featured.lng);
    const pins: MapPin[] = [];
    if (site) pins.push({ x: site.x, y: site.y, hi: true });
    for (const o of others) {
        const s = snapToSite(o.lat, o.lng);
        if (s && !pins.some((p) => p.x === s.x && p.y === s.y)) pins.push({ x: s.x, y: s.y });
    }
    const shopPins: MapPin[] = [];
    for (const s of shops) {
        const p = snapToSite(s.lat, s.lng);
        if (p && !shopPins.some((q) => q.x === p.x && q.y === p.y)) shopPins.push({ x: p.x + 38, y: p.y + 36 });
    }

    const spots = featured.capacity != null ? Math.max(featured.capacity - (featured.attending_count ?? 0), 0) : null;
    const fill = featured.capacity ? Math.min(100, Math.round(((featured.attending_count ?? 0) / featured.capacity) * 100)) : 0;
    const dest = route ? 'Whidbey Island' : null;
    const popX = site ? (site.x / 1440) * 100 : 65;
    const popY = site ? (site.y / 660) * 100 : 70;

    const head = (
        <div className="rv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
            <div>
                <div className="eyebrow eyebrow-gold mb-4">／ NEXT RUN</div>
                <h2 style={{ margin: 0 }}>{(featured.title ?? 'NEXT MEET').toUpperCase()}</h2>
                <p className="text-dim" style={{ marginTop: 10, fontSize: 15 }}>
                    {formatEventTime(featured.start_at)}
                    {featured.location_name ? ` · ${featured.location_name}` : ''}
                    {dest ? ` → ${dest}` : ''}
                </p>
            </div>
            <Link href="/meets" className="mono-row" style={{ textDecoration: 'none' }}>
                <span className="accent">›</span> ALL MEETS
            </Link>
        </div>
    );

    // The map is the EVENT's. An event outside the drawn area (a meet in
    // Phoenix, say) must never sit on an empty regional drawing: the band then
    // shows the event's own card and the door to the live map instead.
    if (!site) {
        return (
            <section className="section on-dark next-run" id="next-run">
                <div className="container">
                    {head}
                    <div className="feature-card corner-wrap rv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                        <span className="corner-bottom-left" />
                        <span className="corner-bottom-right" />
                        <div>
                            <div className="mono-row" style={{ fontSize: 10 }}>
                                <span className="accent">{TYPE_LABEL[featured.type ?? ''] ?? 'MEET'}</span>
                                {featured.host_name ? <><span className="sep" /><span>HOST · {featured.host_name.toUpperCase()}</span></> : null}
                                {spots != null ? <><span className="sep" /><span>{spots} OF {featured.capacity} LEFT</span></> : null}
                            </div>
                            <h3 style={{ margin: '10px 0 0' }}>{featured.title}</h3>
                            <p className="text-dim" style={{ margin: '6px 0 0', fontSize: 14 }}>{featured.location_name ?? 'Meet point TBA'}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <Link href={`/event/${featured.id}`} className="btn">RSVP</Link>
                            <Link href="/meets/map" className="btn btn-ghost">Open the map</Link>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="section on-dark next-run" id="next-run">
            <div className="container">
                {head}

                <div className="map-stage corner-wrap rv">
                    <span className="corner-bottom-left" />
                    <span className="corner-bottom-right" />
                    <StylisedMap crop="hero" route={route} pins={pins} shops={shopPins} className="map-stage-desktop" />
                    <StylisedMap crop="phone" route={route} pins={pins} shops={shopPins} className="map-stage-phone" />
                    <div className="map-scrim" />

                    <div className="map-tag mono-row">
                        <span className="accent">{TYPE_LABEL[featured.type ?? ''] ?? 'MEET'}</span>
                        <span className="sep" />
                        <span>{pins.length} {pins.length === 1 ? 'MEET' : 'MEETS'} · {shopPins.length} {shopPins.length === 1 ? 'SHOP' : 'SHOPS'} PINNED</span>
                    </div>

                    <div className="mappin open" style={{ left: `${popX}%`, top: `${popY}%` }}>
                        <div className="pop pop-up" role="group" aria-label={featured.title ?? 'Next meet'}>
                            <div className="mono-row" style={{ fontSize: 10, justifyContent: 'space-between' }}>
                                <span className="accent">{TYPE_LABEL[featured.type ?? ''] ?? 'MEET'}</span>
                                {featured.host_name ? <span>HOST · {featured.host_name.toUpperCase()}</span> : null}
                            </div>
                            <h4>{featured.title}</h4>
                            <div className="pop-when">{formatEventTime(featured.start_at)}</div>
                            <div className="pop-where">
                                {featured.location_name ?? 'Meet point TBA'}
                                {dest ? ` → ${dest}` : ''}
                            </div>
                            {spots != null ? (
                                <div className="pop-spots">
                                    <div className="bar-track">
                                        <div className="bar-fill" style={{ width: `${fill}%` }} />
                                    </div>
                                    <b>{spots} OF {featured.capacity} LEFT</b>
                                </div>
                            ) : null}
                            <Link href={`/event/${featured.id}`} className="btn" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
                                RSVP
                            </Link>
                        </div>
                    </div>

                    <div className="map-key mono-row">
                        <i>
                            <u />
                            MEET
                        </i>
                        <i className="k-shop">
                            <u />
                            SHOP
                        </i>
                        {route ? (
                            <i className="k-rt">
                                <u />
                                ROUTE
                            </i>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
