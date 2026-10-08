import 'server-only';
import { cache } from 'react';
/**
 * Loaders for /admin/events/[id] — an admin-only READ view of one event.
 * Everything runs on the service-role client; the page itself has already
 * passed requirePlatformAdmin(). The shop slug used for console links always
 * comes from the shops embed here, never from the URL or a query param.
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadEventAreaLabel } from '@/lib/event-area-label';
import { getShopVendorBySlug } from '@/lib/store-shops';
import { enabledModules, ModuleKey } from '@/lib/shop-modules';
import { loadModuleContext } from '@/lib/auth-guard';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RSVP_LIMIT = 500;

export type AdminEvent = {
    id: string;
    code: string | null;
    type: string;
    title: string | null;
    description: string | null;
    location_name: string | null;
    location_detail: string | null;
    lat: number | null;
    lng: number | null;
    start_at: string;
    time_zone: string | null;
    capacity: number | null;
    attending_count: number | null;
    visibility: string | null;
    tags: string[] | null;
    cancelled_at: string | null;
    is_official: boolean | null;
    rsvp_mode: string | null;
    verification_status: string | null;
    coin_enabled: boolean | null;
    created_at: string | null;
    updated_at: string | null;
    shop_id: number | null;
    host_id: string | null;
    hero_image_url: string | null;
    destination_name: string | null;
    destination_lat: number | null;
    destination_lng: number | null;
    route_plan: unknown;
    area_label: string | null;
    host: { id: string; handle: string; display_name: string | null; kind: string | null } | null;
    shop: { id: number; slug: string; name: string; status: string | null } | null;
};

const EVENT_COLS = `id, code, type, title, description, location_name, location_detail, lat, lng,
    start_at, time_zone, capacity, attending_count, visibility, tags, cancelled_at, is_official,
    rsvp_mode, verification_status, coin_enabled, created_at, updated_at, shop_id, host_id,
    hero_image_url, destination_name, destination_lat, destination_lng, route_plan`;

/**
 * The event + its host profile + hosting shop. Both embeds carry an explicit
 * FK hint: event_cohosts added a second events<->shops relationship, which
 * makes a bare `shops(...)` embed ambiguous (PGRST201) — same hints as the
 * admin events list.
 */
export const loadEvent = cache(async (id: string): Promise<AdminEvent | null> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('events')
        .select(
            `${EVENT_COLS},
             host:profiles!events_host_id_fkey(id, handle, display_name, kind),
             shop:shops!events_shop_id_fkey(id, slug, name, status)`,
        )
        .eq('id', id)
        .maybeSingle();
    if (error) console.error('[admin/events/[id]] event load failed:', error.message);
    if (!data) return null;
    return { ...(data as any), area_label: await loadEventAreaLabel(admin, id) } as AdminEvent;
});

export type AdminTier = {
    id: string;
    name: string | null;
    price_cents: number | null;
    currency: string | null;
    capacity: number | null;
    reserved_spot: boolean | null;
    active: boolean | null;
    sort: number | null;
};

export async function loadTiers(id: string): Promise<AdminTier[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_tiers')
        .select('id, name, price_cents, currency, capacity, reserved_spot, active, sort')
        .eq('event_id', id)
        .order('sort', { ascending: true });
    if (error) console.error('[admin/events/[id]] tiers load failed:', error.message);
    return ((data as any[]) ?? []) as AdminTier[];
}

export type AdminRsvp = {
    profile_id: string;
    status: string;
    hold_state: string | null;
    seats: number;
    spot_no: number | null;
    tier_id: string | null;
    payment_ref: string | null;
    hold_expires_at: string | null;
    rsvped_at: string | null;
    profile: { id: string; handle: string; display_name: string | null } | null;
};

export async function loadRsvps(id: string): Promise<AdminRsvp[]> {
    const admin = getSupabaseAdmin();
    const build = (cols: string) =>
        admin
            .from('event_rsvps')
            .select(`${cols}, profile:profiles!event_rsvps_profile_id_fkey(id, handle, display_name)`)
            .eq('event_id', id)
            .order('rsvped_at', { ascending: false })
            .limit(RSVP_LIMIT);
    const base = 'profile_id, status, hold_state, spot_no, tier_id, payment_ref, hold_expires_at, rsvped_at';
    let { data, error } = await build(`${base}, seats`);
    if (error && error.code === '42703') {
        // Pre-080 schema: no event_rsvps.seats yet — every row is one seat.
        ({ data, error } = await build(base));
    }
    if (error) console.error('[admin/events/[id]] rsvps load failed:', error.message);
    return ((data as any[]) ?? []).map((r) => ({ ...r, seats: Number(r.seats ?? 1) || 1 })) as AdminRsvp[];
}

export type AdminTicket = {
    id: string;
    hold_id: string | null;
    seat: number | null;
    tier_id: string | null;
    order_id: string | null;
    order_paid_cents: number | null;
    purchaser_profile_id: string | null;
    attendee_name: string | null;
    attendee_email: string | null;
    attendee_profile_id: string | null;
    sweater_size: string | null;
    status: string;
    spot_no: number | null;
    checked_in_at: string | null;
    cancelled_at: string | null;
    refund_cents: number | null;
    created_at: string | null;
};

export type ProfileLite = { id: string; handle: string; display_name: string | null };

/** Tickets (migration 080) + the profiles they reference. Fails soft to [] pre-080. */
export const loadTickets = cache(async (
    id: string,
): Promise<{ tickets: AdminTicket[]; profiles: Map<string, ProfileLite> }> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_tickets')
        .select(
            `id, hold_id, seat, tier_id, order_id, order_paid_cents, purchaser_profile_id,
             attendee_name, attendee_email, attendee_profile_id, sweater_size, status, spot_no,
             checked_in_at, cancelled_at, refund_cents, created_at`,
        )
        .eq('event_id', id)
        .order('created_at', { ascending: false })
        .order('seat', { ascending: true });
    const profiles = new Map<string, ProfileLite>();
    if (error) {
        if (error.code !== 'PGRST205' && error.code !== '42P01') {
            console.error('[admin/events/[id]] tickets load failed:', error.message);
        }
        return { tickets: [], profiles };
    }
    const tickets = ((data as any[]) ?? []) as AdminTicket[];
    const ids = [
        ...new Set(
            tickets
                .flatMap((t) => [t.purchaser_profile_id, t.attendee_profile_id])
                .filter((v): v is string => !!v),
        ),
    ];
    if (ids.length) {
        const { data: ps } = await admin.from('profiles').select('id, handle, display_name').in('id', ids);
        for (const p of (ps as ProfileLite[]) ?? []) profiles.set(p.id, p);
    }
    return { tickets, profiles };
});

export type AdminCheckin = { method: string | null; checked_in_at: string | null };

export async function loadCheckins(id: string): Promise<Map<string, AdminCheckin>> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_checkins')
        .select('profile_id, method, checked_in_at')
        .eq('event_id', id);
    if (error) console.error('[admin/events/[id]] checkins load failed:', error.message);
    const out = new Map<string, AdminCheckin>();
    for (const c of (data as any[]) ?? []) {
        out.set(c.profile_id, { method: c.method ?? null, checked_in_at: c.checked_in_at ?? null });
    }
    return out;
}

export type AdminCohost = {
    shopId: number;
    name: string;
    slug: string;
    status: string;
};

export async function loadCohosts(id: string): Promise<AdminCohost[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_cohosts')
        .select('shop_id, status, invited_at, shop:shops!event_cohosts_shop_id_fkey(name, slug)')
        .eq('event_id', id)
        .order('invited_at', { ascending: true });
    if (error) console.error('[admin/events/[id]] cohosts load failed:', error.message);
    return ((data as any[]) ?? []).map((r) => ({
        shopId: r.shop_id,
        name: r.shop?.name ?? `Shop #${r.shop_id}`,
        slug: r.shop?.slug ?? '',
        status: r.status,
    }));
}

/**
 * The modules the shop console would show for this shop — the same resolver as
 * the shop layout (tier ± overrides, then the Products/Orders data gates).
 * Role gating is skipped: an admin acts as owner.
 */
export const loadShopConsoleContext = cache(async (slug: string, shopId: number): Promise<string[]> => {
    const { tier, overrides, showProducts } = await loadModuleContext(shopId);
    const showOrders = (await getShopVendorBySlug(slug)) !== null;
    const enabled = enabledModules(tier, overrides);
    if (!showProducts) enabled.delete(ModuleKey.Products);
    if (!showOrders) enabled.delete(ModuleKey.Orders);
    return [...enabled];
});

export type EventCounts = {
    confirmedSeats: number;
    holds: number;
    waitlist: number;
    maybe: number;
    declined: number;
    paid: number;
    checkedIn: number;
    tickets: { confirmed: number; held: number; cancelled: number; checkedIn: number; total: number };
    capacity: number | null;
    attendingCounter: number;
};

/** Derive the headline numbers from the rows themselves (not the DB counter). */
export function deriveCounts(
    event: Pick<AdminEvent, 'capacity' | 'attending_count'>,
    rsvps: AdminRsvp[],
    tickets: AdminTicket[],
    checkins: Map<string, AdminCheckin>,
    now: number = Date.now(),
): EventCounts {
    let confirmedSeats = 0;
    let holds = 0;
    let waitlist = 0;
    let maybe = 0;
    let declined = 0;
    let paid = 0;
    for (const r of rsvps) {
        if (r.status === 'going' && r.hold_state === 'confirmed') confirmedSeats += r.seats;
        if (
            r.status === 'going' &&
            r.hold_state === 'held' &&
            (!r.hold_expires_at || new Date(r.hold_expires_at).getTime() > now)
        ) {
            holds += 1;
        }
        if (r.hold_state === 'waitlisted' || r.status === 'waitlist') waitlist += 1;
        if (r.status === 'maybe') maybe += 1;
        if (r.status === 'declined') declined += 1;
        if (r.payment_ref != null && r.hold_state === 'confirmed') paid += 1;
    }
    return {
        confirmedSeats,
        holds,
        waitlist,
        maybe,
        declined,
        paid,
        checkedIn: checkins.size,
        tickets: {
            confirmed: tickets.filter((t) => t.status === 'confirmed').length,
            held: tickets.filter((t) => t.status === 'held').length,
            cancelled: tickets.filter((t) => t.status === 'cancelled').length,
            checkedIn: tickets.filter((t) => !!t.checked_in_at).length,
            total: tickets.length,
        },
        capacity: event.capacity ?? null,
        attendingCounter: Number(event.attending_count ?? 0),
    };
}
