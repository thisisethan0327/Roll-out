/**
 * Shared loader for the plottable meets-map payload.
 *
 * Used by both /meets/map (standalone map view) and /meets (desktop split view)
 * so the list and the map read exactly the same rows and filters. Shops carry
 * the same rich profile data the /shops directory resolves — logo (avatar_url),
 * verification, review stats, and service capabilities — so the map popups can
 * render a branded card without a second data path.
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { MapEvent, MapShop } from './map/MeetsMap';

const EVENT_TYPES = ['NIGHT_RUN', 'CAR_MEET', 'TRACK_DAY', 'CRUISE', 'SHOW'] as const;
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
        .select(
            'id, code, type, title, location_name, start_at, lat, lng, attending_count, host_handle, is_official',
        )
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
