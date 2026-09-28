/**
 * Shared loader for the plottable meets-map payload.
 *
 * Used by both /meets/map (standalone map view) and /meets (desktop split view)
 * so the list and the map read exactly the same rows and filters. Shops carry
 * the same rich profile data the /shops directory resolves — logo (avatar_url),
 * verification, review stats, and service capabilities — so the map popups can
 * render a branded card without a second data path.
 *
 * Private / followers-only meets (migrations 088/089) come from
 * rollout.event_teasers: a viewer who may open one gets its real pin (from
 * event_cards, marked private); everyone else gets a LOCK pin at the view's
 * fuzzed approx_lat/approx_lng and a teaser popup — never the venue. Teasers
 * fail soft: no view → no extra pins.
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUpcomingTeasers } from '@/lib/event-teasers';
import { mergeByStartAt, type EventTeaser } from '@/lib/event-teaser-format';
import type { MapEvent, MapShop } from './map/MeetsMap';

const MAP_EVENT_COLS =
    'id, code, type, title, location_name, start_at, time_zone, lat, lng, attending_count, host_handle, is_official';

function toMapEvent(e: any): MapEvent {
    return {
        id: e.id as string,
        code: e.code ?? null,
        type: e.type ?? null,
        title: e.title ?? 'Untitled meet',
        location_name: e.location_name ?? null,
        start_at: e.start_at ?? null,
        time_zone: e.time_zone ?? null,
        lat: Number(e.lat),
        lng: Number(e.lng),
        attending_count: e.attending_count ?? 0,
        host_handle: e.host_handle ?? null,
        is_official: !!e.is_official,
    };
}

/** A locked teaser pin — fuzzed coords, no venue, no attendee count. */
function teaserToMapEvent(t: EventTeaser): MapEvent | null {
    if (t.approx_lat == null || t.approx_lng == null) return null;
    return {
        id: t.id,
        code: t.code,
        type: t.type,
        title: t.title ?? 'Private event',
        location_name: null,
        start_at: t.start_at,
        time_zone: t.time_zone,
        lat: t.approx_lat,
        lng: t.approx_lng,
        attending_count: 0,
        host_handle: t.host_handle,
        is_official: false,
        locked: true,
        privacy: t.visibility,
        general_area: t.general_area,
    };
}

/**
 * Pins for upcoming teasers. Viewers who may open an event get its real
 * event_cards pin (service role, only for ids the view itself said this
 * viewer can view); the rest get lock pins. An allowed event with no card row
 * falls back to its lock pin rather than vanishing.
 */
async function loadTeaserPins(type: EventType | null): Promise<MapEvent[]> {
    const teasers = await loadUpcomingTeasers(type);
    if (teasers.length === 0) return [];
    const allowedIds = teasers.filter((t) => t.viewer_can_view).map((t) => t.id);
    const exact = new Map<string, MapEvent>();
    if (allowedIds.length > 0) {
        const { data, error } = await getSupabaseAdmin()
            .from('event_cards')
            .select(MAP_EVENT_COLS)
            .in('id', allowedIds)
            .not('lat', 'is', null)
            .not('lng', 'is', null);
        if (error) console.error('[meets/mapData] private event pins load failed:', error.message);
        for (const e of (data as any[]) ?? []) exact.set(e.id, toMapEvent(e));
    }
    const pins: MapEvent[] = [];
    for (const t of teasers) {
        const real = t.viewer_can_view ? exact.get(t.id) : undefined;
        if (real) pins.push({ ...real, privacy: t.visibility });
        else {
            const pin = teaserToMapEvent(t);
            if (pin) pins.push(pin);
        }
    }
    return pins;
}

const EVENT_TYPES = ['CAR_MEET', 'CRUISE', 'SHOW', 'TRACK_DAY', 'NIGHT_RUN'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isValidType(t: string | undefined): t is EventType {
    return !!t && (EVENT_TYPES as readonly string[]).includes(t);
}

export async function loadMapData(
    type: EventType | null,
): Promise<{ events: MapEvent[]; shops: MapShop[] }> {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    let eventsQ = supabase
        .from('event_cards')
        .select(MAP_EVENT_COLS)
        .eq('visibility', 'public')
        .gte('start_at', nowIso)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .order('start_at', { ascending: true })
        .limit(300);
    if (type) eventsQ = eventsQ.eq('type', type);

    const shopsQ = supabase
        .from('shops')
        .select(
            'id, slug, name, lat, lng, city, state_region, primary_color, offers_services, sells_products, show_on_map, location_precision',
        )
        // Pending/unverified shops are not pinned on the public map.
        .eq('status', 'verified')
        .eq('show_on_map', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(300);

    const [eventsRes, shopsRes, teaserPins] = await Promise.all([eventsQ, shopsQ, loadTeaserPins(type)]);

    const publicEvents = ((eventsRes.data as any[]) ?? []).map(toMapEvent);
    // Teasers join the same date ordering as the public meets.
    const events = mergeByStartAt(publicEvents, teaserPins);

    const shopRows = ((shopsRes.data as any[]) ?? []) as any[];

    // Resolve shop_page handle / logo / verification and review stats in the same
    // two round-trips the /shops directory uses, so map popups match the cards.
    const shopIds = shopRows.map((s) => s.id);
    const pageByShop = new Map<
        number,
        { handle: string | null; avatar_url: string | null; is_verified: boolean }
    >();
    const statByShop = new Map<number, { rating_avg: number; rating_count: number }>();

    if (shopIds.length > 0) {
        const [pagesRes, statsRes] = await Promise.all([
            supabase
                .from('profiles')
                .select('shop_id, handle, avatar_url, is_verified')
                .eq('kind', 'shop_page')
                .in('shop_id', shopIds),
            supabase
                .from('shop_review_stats')
                .select('shop_id, rating_avg, rating_count')
                .in('shop_id', shopIds),
        ]);
        for (const p of (pagesRes.data as any[]) ?? []) {
            if (p.shop_id != null) {
                pageByShop.set(p.shop_id, {
                    handle: p.handle ?? null,
                    avatar_url: p.avatar_url ?? null,
                    is_verified: !!p.is_verified,
                });
            }
        }
        for (const st of (statsRes.data as any[]) ?? []) {
            if (st.shop_id != null) {
                statByShop.set(st.shop_id, {
                    rating_avg: Number(st.rating_avg ?? 0),
                    rating_count: Number(st.rating_count ?? 0),
                });
            }
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
        location_precision: s.location_precision === 'area' ? 'area' : 'exact',
        primary_color: s.primary_color ?? null,
        handle: pageByShop.get(s.id)?.handle ?? null,
        avatar_url: pageByShop.get(s.id)?.avatar_url ?? null,
        is_verified: pageByShop.get(s.id)?.is_verified ?? false,
        rating_avg: statByShop.get(s.id)?.rating_avg ?? 0,
        rating_count: statByShop.get(s.id)?.rating_count ?? 0,
        offers_services: !!s.offers_services,
        sells_products: !!s.sells_products,
    })) as MapShop[];

    return { events, shops };
}
