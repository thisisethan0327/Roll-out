/**
 * Data loaders for the /me consumer portal.
 *
 * TWO enforcement models, chosen per source:
 *
 *  • public.* customer-identity data (tickets + their check-ins, invoices,
 *    activity, and customer-visible chat) is read through the ANON SSR client
 *    (getSupabaseServer). RLS migration 032 (rollout_me_* policies, keyed on
 *    auth.uid()/JWT email) is the gate — so a member structurally cannot read a
 *    ticket that isn't theirs, even by guessing its id. This is deliberate: the
 *    security guarantee lives in the database, not in app-layer filters.
 *
 *  • rollout.* member data (appointments, RSVPs, garage vehicles, posts) is read
 *    through the service-role admin client with an EXPLICIT owner/profile filter
 *    (requester_profile_id / owner_id / author_id / profile_id = the caller's
 *    profile id). Same trust model as the shop dashboard: guard first, then a
 *    scoped service-role read. Shop *names* (rollout.shops) are non-sensitive
 *    lookups resolved via the same admin client.
 *
 * Server-only.
 */
import 'server-only';
import { getSupabaseServer } from './supabase/server';
import { getSupabaseAdmin } from './supabase/admin';

// ── Shop name/slug resolution (non-sensitive) ────────────────────────────────

export type ShopRef = { id: number; name: string; slug: string };

export async function resolveShopRefs(shopIds: number[]): Promise<Map<number, ShopRef>> {
    const map = new Map<number, ShopRef>();
    const ids = Array.from(new Set(shopIds.filter((n) => n != null)));
    if (ids.length === 0) return map;
    const admin = getSupabaseAdmin(); // rollout schema
    const { data, error } = await admin.from('shops').select('id, name, slug').in('id', ids);
    if (error) console.error('[lib/me-data] resolveShopRefs failed:', error.message);
    for (const s of (data ?? []) as any[]) {
        map.set(Number(s.id), { id: Number(s.id), name: s.name, slug: s.slug });
    }
    return map;
}

// ── Tickets (public.*, RLS-enforced) ─────────────────────────────────────────

export type MyTicket = {
    id: string;
    ticket_id: string | null;
    status: string | null;
    customer_name: string | null;
    car_year: number | string | null;
    car_make: string | null;
    car_model: string | null;
    service_day: string | null;
    end_date: string | null;
    total_price: number | null;
    created_at: string | null;
    shop_id: number | null;
    shop: ShopRef | null;
};

export async function loadMyTickets(): Promise<MyTicket[]> {
    const supabase = await getSupabaseServer(); // anon, RLS applies
    const { data, error } = await supabase
        .from('tickets')
        .select(
            'id, ticket_id, status, customer_name, car_year, car_make, car_model, service_day, end_date, total_price, created_at, shop_id',
        )
        .order('created_at', { ascending: false });
    if (error) console.error('[lib/me-data] loadMyTickets failed:', error.message);
    const rows = (data ?? []) as any[];
    const shops = await resolveShopRefs(rows.map((r) => Number(r.shop_id)));
    return rows.map((r) => ({
        ...r,
        shop_id: r.shop_id != null ? Number(r.shop_id) : null,
        shop: r.shop_id != null ? shops.get(Number(r.shop_id)) ?? null : null,
    }));
}

// ── Single ticket detail (public.*, RLS-enforced) ────────────────────────────

// Activity types that are appropriate to surface to a customer. Internal-only
// events (worker assignment, staff notes, message logs) are omitted.
const CUSTOMER_ACTIVITY_TYPES = [
    'created',
    'status_change',
    'checkin',
    'checkout',
    'progress',
    'service_added',
    'photo_added',
    'invoice_sent',
    'payment',
];

export type TicketDetail = {
    ticket: any;
    shop: ShopRef | null;
    checkins: any[];
    invoices: any[];
    activity: any[];
    messages: any[];
};

export async function loadTicketDetail(id: string): Promise<TicketDetail | null> {
    const supabase = await getSupabaseServer(); // anon, RLS applies

    // RLS silently returns no row for a ticket the caller doesn't own.
    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (ticketError) console.error('[lib/me-data] loadTicketDetail ticket failed:', ticketError.message);
    if (!ticket) return null;

    const [checkinsRes, invoicesRes, activityRes, messagesRes] = await Promise.all([
        supabase
            .from('ticket_checkins')
            .select('id, type, label, notes, condition_notes, odometer, fuel_level, media, created_at')
            .eq('ticket_id', id)
            .order('created_at', { ascending: false }),
        supabase
            .from('ticket_invoices')
            .select('id, type, status, amount, amount_paid, subtotal, tax_amount, discount_amount, invoice_date, due_date, paid_at, created_at')
            .eq('ticket_id', id)
            .order('created_at', { ascending: false }),
        supabase
            .from('ticket_activity')
            .select('id, type, title, description, created_at')
            .eq('ticket_id', id)
            .in('type', CUSTOMER_ACTIVITY_TYPES)
            .order('created_at', { ascending: false })
            .limit(50),
        // RLS already restricts to visibility='customer' on owned tickets.
        supabase
            .from('ticket_messages')
            .select('id, sender_type, sender_name, message, visibility, attachments, created_at')
            .eq('ticket_id', id)
            .eq('visibility', 'customer')
            .order('created_at', { ascending: true }),
    ]);

    for (const [label, res] of [
        ['checkins', checkinsRes],
        ['invoices', invoicesRes],
        ['activity', activityRes],
        ['messages', messagesRes],
    ] as const) {
        if (res.error)
            console.error(`[lib/me-data] loadTicketDetail ${label} failed:`, res.error.message);
    }

    const shopMap = await resolveShopRefs([Number((ticket as any).shop_id)]);

    return {
        ticket,
        shop: (ticket as any).shop_id != null ? shopMap.get(Number((ticket as any).shop_id)) ?? null : null,
        checkins: (checkinsRes.data ?? []) as any[],
        invoices: (invoicesRes.data ?? []) as any[],
        activity: (activityRes.data ?? []) as any[],
        messages: (messagesRes.data ?? []) as any[],
    };
}

// ── Appointments (rollout.*, explicit per-user filter) ───────────────────────

export type MyAppointment = {
    id: string;
    service_type: string | null;
    preferred_at: string | null;
    status: string | null;
    notes: string | null;
    decline_reason: string | null;
    ticket_id: string | null;
    created_at: string | null;
    shop_id: number | null;
    shop: ShopRef | null;
    vehicle: string | null;
};

export async function loadMyAppointments(profileId: string): Promise<MyAppointment[]> {
    const admin = getSupabaseAdmin(); // rollout schema
    const { data, error } = await admin
        .from('appointment_requests')
        .select('id, shop_id, service_type, preferred_at, status, notes, decline_reason, ticket_id, vehicle_id, created_at')
        .eq('requester_profile_id', profileId)
        .order('created_at', { ascending: false });
    if (error) console.error('[lib/me-data] loadMyAppointments failed:', error.message);
    const rows = (data ?? []) as any[];

    const shops = await resolveShopRefs(rows.map((r) => Number(r.shop_id)));

    // Resolve vehicle labels (rollout.vehicles) for any linked vehicle_ids.
    const vehIds = Array.from(new Set(rows.map((r) => r.vehicle_id).filter(Boolean)));
    const vehLabel = new Map<string, string>();
    if (vehIds.length > 0) {
        const { data: vehs, error: vehsError } = await admin
            .from('vehicles')
            .select('id, year, make, model')
            .in('id', vehIds);
        if (vehsError) console.error('[lib/me-data] loadMyAppointments vehicles failed:', vehsError.message);
        for (const v of (vehs ?? []) as any[]) {
            vehLabel.set(
                v.id,
                [v.year, v.make, v.model].filter(Boolean).join(' '),
            );
        }
    }

    return rows.map((r) => ({
        id: r.id,
        service_type: r.service_type,
        preferred_at: r.preferred_at,
        status: r.status,
        notes: r.notes,
        decline_reason: r.decline_reason,
        ticket_id: r.ticket_id,
        created_at: r.created_at,
        shop_id: r.shop_id != null ? Number(r.shop_id) : null,
        shop: r.shop_id != null ? shops.get(Number(r.shop_id)) ?? null : null,
        vehicle: r.vehicle_id ? vehLabel.get(r.vehicle_id) || null : null,
    }));
}

// ── Upcoming RSVPs (rollout.*, explicit per-user filter) ──────────────────────

export type MyRsvp = {
    event_id: string;
    status: string | null;
    title: string | null;
    start_at: string | null;
    location_name: string | null;
    code: string | null;
    type: string | null;
    hero_image_url: string | null;
};

export async function loadMyUpcomingRsvps(profileId: string): Promise<MyRsvp[]> {
    const admin = getSupabaseAdmin();
    const { data: rsvps, error: rsvpsError } = await admin
        .from('event_rsvps')
        .select('event_id, status')
        .eq('profile_id', profileId);
    if (rsvpsError) console.error('[lib/me-data] loadMyUpcomingRsvps rsvps failed:', rsvpsError.message);
    const rows = (rsvps ?? []) as any[];
    if (rows.length === 0) return [];

    const eventIds = rows.map((r) => r.event_id);
    const nowIso = new Date().toISOString();
    const { data: events, error: eventsError } = await admin
        .from('events')
        .select('id, title, start_at, location_name, code, type, hero_image_url, cancelled_at')
        .in('id', eventIds)
        .is('cancelled_at', null)
        .gte('start_at', nowIso)
        .order('start_at', { ascending: true });
    if (eventsError) console.error('[lib/me-data] loadMyUpcomingRsvps events failed:', eventsError.message);

    const statusById = new Map(rows.map((r) => [r.event_id, r.status]));
    return ((events ?? []) as any[]).map((e) => ({
        event_id: e.id,
        status: statusById.get(e.id) ?? null,
        title: e.title,
        start_at: e.start_at,
        location_name: e.location_name,
        code: e.code,
        type: e.type ?? null,
        hero_image_url: e.hero_image_url ?? null,
    }));
}

// ── Garage vehicles + posts (rollout.*, explicit per-user filter) ─────────────

export type MyVehicle = {
    id: string;
    garage_number: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    color: string | null;
    build_stage: string | null;
    hero_image_url: string | null;
    engine: string | null;
    hp: number | null;
    torque: number | null;
    visibility: string | null;
};

export async function loadMyGarage(profileId: string): Promise<MyVehicle[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('vehicles')
        .select('id, garage_number, year, make, model, trim, color, build_stage, hero_image_url, engine, hp, torque, visibility, created_at')
        .eq('owner_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
    if (error) console.error('[lib/me-data] loadMyGarage failed:', error.message);
    return (data ?? []) as any[];
}

export type MyPost = {
    id: string;
    type: string | null;
    body: string | null;
    hero_image_url: string | null;
    visibility: string | null;
    like_count: number | null;
    comment_count: number | null;
    created_at: string | null;
};

export async function loadMyPosts(profileId: string): Promise<MyPost[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('posts')
        .select('id, type, body, hero_image_url, visibility, like_count, comment_count, created_at')
        .eq('author_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) console.error('[lib/me-data] loadMyPosts failed:', error.message);
    return (data ?? []) as any[];
}
