/**
 * /meets/map — map view of upcoming meets + shops across the platform.
 *
 * Server component: loads the plottable data (public upcoming events with
 * coordinates, and map-visible shops) via the service-role client, then hands
 * it to the client <MeetsMap> which renders Leaflet + CARTO dark tiles (no API
 * key). Two pin styles: events (gold) and shops (outline), each with a popover
 * that deep-links to the event / shop profile.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { MeetsMap, type MapEvent, type MapShop } from './MeetsMap';

const EVENT_TYPES = ['NIGHT_RUN', 'CAR_MEET', 'TRACK_DAY', 'CRUISE', 'SHOW'] as const;
type EventType = (typeof EVENT_TYPES)[number];

const TYPE_LABEL: Record<EventType, string> = {
    NIGHT_RUN: 'Night Run',
    CAR_MEET: 'Car Meet',
    TRACK_DAY: 'Track Day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
};

function isValidType(t: string | undefined): t is EventType {
    return !!t && (EVENT_TYPES as readonly string[]).includes(t);
}

export const metadata: Metadata = {
    title: 'Meets Map · Rollout',
    description:
        'Map of upcoming car meets, night runs, track days, and shops on Rollout — find what is happening near you.',
};

async function loadMapData(type: EventType | null): Promise<{ events: MapEvent[]; shops: MapShop[] }> {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    let eventsQ = supabase
        .from('event_cards')
        .select('id, code, type, title, location_name, start_at, lat, lng, attending_count, host_handle, is_official')
        .eq('visibility', 'public')
        .gte('start_at', nowIso)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .order('start_at', { ascending: true })
        .limit(300);
    if (type) eventsQ = eventsQ.eq('type', type);

    const shopsQ = supabase
        .from('shops')
        .select('id, slug, name, lat, lng, city, state_region, primary_color, show_on_map')
        // Pending/unverified shops are not pinned on the public map.
        .eq('status', 'verified')
        .eq('show_on_map', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(300);

    const [eventsRes, shopsRes] = await Promise.all([eventsQ, shopsQ]);

    const events = ((eventsRes.data as any[]) ?? []).map((e) => ({
        id: e.id as string,
        code: e.code ?? null,
        type: e.type ?? null,
        title: e.title ?? 'Untitled meet',
        location_name: e.location_name ?? null,
        start_at: e.start_at ?? null,
        lat: Number(e.lat),
        lng: Number(e.lng),
        attending_count: e.attending_count ?? 0,
        host_handle: e.host_handle ?? null,
        is_official: !!e.is_official,
    })) as MapEvent[];

    const shopRows = ((shopsRes.data as any[]) ?? []) as any[];

    // Resolve shop_page handles for /u/[handle] links in one round-trip.
    const shopIds = shopRows.map((s) => s.id);
    const handleByShop = new Map<number, string>();
    if (shopIds.length > 0) {
        const { data: pages } = await supabase
            .from('profiles')
            .select('shop_id, handle')
            .eq('kind', 'shop_page')
            .in('shop_id', shopIds);
        for (const p of (pages as any[]) ?? []) {
            if (p.shop_id != null && p.handle) handleByShop.set(p.shop_id, p.handle);
        }
    }

    const shops = shopRows.map((s) => ({
        id: s.id as number,
        slug: s.slug ?? null,
        name: s.name ?? 'Shop',
        lat: Number(s.lat),
        lng: Number(s.lng),
        city: s.city ?? null,
        state_region: s.state_region ?? null,
        primary_color: s.primary_color ?? null,
        handle: handleByShop.get(s.id) ?? null,
    })) as MapShop[];

    return { events, shops };
}

export default async function MeetsMapPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const { events, shops } = await loadMapData(type);
    const listHref = type ? `/meets?type=${type}` : '/meets';

    return (
        <>
            {/* HEADER + VIEW TOGGLE */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
                <div
                    className="container"
                    style={{ padding: '18px 0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <div>
                        <div className="eyebrow eyebrow-gold mb-4">／ MEETS MAP</div>
                        <h1 style={{ fontSize: 'clamp(22px, 3vw, 34px)', letterSpacing: 1, margin: 0 }}>
                            {type ? `${TYPE_LABEL[type].toUpperCase()} · MAP` : "WHAT'S NEARBY"}
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Link
                            href={listHref}
                            style={{
                                padding: '8px 14px',
                                border: '1px solid var(--gold)',
                                background: 'transparent',
                                color: 'var(--gold)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 11,
                                letterSpacing: 'var(--track-wider)',
                                textDecoration: 'none',
                            }}
                        >
                            ◂ LIST
                        </Link>
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
                            MAP
                        </span>
                    </div>
                </div>
            </section>

            <MeetsMap events={events} shops={shops} />

            {/* LEGEND / COUNTS */}
            <section style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line)' }}>
                <div
                    className="container"
                    style={{ padding: '14px 0', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}
                >
                    <span className="mono-row" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)', marginRight: 6 }} />
                        {events.length} UPCOMING {events.length === 1 ? 'MEET' : 'MEETS'}
                    </span>
                    <span className="mono-row" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '2px solid var(--text)', marginRight: 6 }} />
                        {shops.length} {shops.length === 1 ? 'SHOP' : 'SHOPS'}
                    </span>
                    {events.length === 0 ? (
                        <span className="text-dim" style={{ fontSize: 12 }}>
                            No upcoming meets with a pinned location{type ? ' in this category' : ''} yet — shops still shown.
                        </span>
                    ) : null}
                </div>
            </section>
        </>
    );
}
