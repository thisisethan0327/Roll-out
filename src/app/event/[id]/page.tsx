/**
 * /event/[id] — public event page for shareable links + SEO, now with web RSVP.
 *
 * Loads from the base rollout.events table (via the service-role client) so
 * PAST and CANCELLED public events still render with the right banner — the
 * event_cards view hides cancelled rows, which is wrong for a shareable link.
 *
 * A public event renders for anyone. A non-public event (followers/private)
 * only renders for a signed-in viewer who is the host, a manager+ of the
 * hosting shop, a platform admin, or who already has an RSVP row for it — see
 * lib/event-visibility.ts's canViewEvent (pure, unit-checkable) for the rule.
 * Everyone else, including signed-out visitors, gets notFound() same as a
 * bad id. This does not change who may RSVP — the RSVP RPCs enforce that on
 * their own regardless of what this page renders. Non-public events also
 * carry `robots: noindex` (see generateMetadata) and are already excluded
 * from sitemap.ts, which only lists visibility='public' rows.
 *
 * Logged-in members RSVP inline (RLS-enforced writes); signed-out members get
 * a sign-in CTA that returns here. JSON-LD Event structured data keeps public
 * meets indexable + rich-previewable.
 */
import type { Metadata } from 'next';
import { StylisedMap } from '@/components/map/StylisedMap';
import { hasDrawnRoute } from '@/lib/map-sites';
import { formatEventTime } from '@/lib/event-time';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getConsumerProfile } from '@/lib/consumer';
import { viewerCanSeeNonPublicEvent } from '@/lib/event-viewer';
import { resolveCover, isDefaultCoverUrl } from '@/lib/event-covers';
import { fetchEventTierProductImages } from '@/lib/event-tier-images';
import { RsvpControls } from './RsvpControls';
import { ShareBar } from './ShareBar';
import { TiersSection, type TierView } from './TiersSection';
import { MyTicketsPanel } from './MyTicketsPanel';
import type { RsvpState } from './actions';
import { multiTicketsEnabled, myTicketsForEvent } from '@/lib/event-tickets';
import { isDeadTicketStatus } from '@/lib/event-tickets-shared';
import { parseRoutePlan, buildRoutePoints, buildGoogleMapsDirUrl } from '@/lib/route-plan';
import { fetchDrivingPolyline, type LatLng } from './route-osrm';
import { EventCoverHero } from './EventCoverHero';
import { StatBand } from './StatBand';
import { CoverStoryBrief } from './CoverStoryBrief';
import { TicketCard } from './TicketCard';
import { RouteSection } from './RouteSection';
import RouteMapLoader from './RouteMapLoader';
import { SponsorsSection } from './SponsorsSection';
import { HostBlock } from './HostBlock';
import { ActionsToolbar } from './ActionsToolbar';
import { ConvoySection } from './ConvoySection';
import styles from './cover-story.module.css';

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
    /** IANA zone the event is scheduled in (migration 058); rendered with its label. */
    time_zone: string | null;
    capacity: number | null;
    attending_count: number | null;
    visibility: string | null;
    is_official: boolean | null;
    cancelled_at: string | null;
    tags: string[] | null;
    /** 'free' (default — every pre-E2 event) | 'paid' | 'tiered'. */
    rsvp_mode: string | null;
    /** Refund policy overrides (077) — {refund_cutoff_hours}; null = 72h default. */
    reservation_policy: { refund_cutoff_hours?: number | string | null } | null;
    host: { handle: string | null; display_name: string | null; is_verified: boolean | null } | null;
    shop: { slug: string | null } | null;
    /** Host-planned itinerary (migration 20260921_076_event_route_plan.sql) —
     * jsonb array of {seq, kind, name, lat, lng, eta_local?, dwell_min?, note?}
     * or null. Parsed via route-plan.ts's parseRoutePlan, never read raw. */
    route_plan: unknown;
    destination_name: string | null;
    destination_lat: number | null;
    destination_lng: number | null;
};

type Attendee = {
    profile_id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
};

/** Event sponsors (migration 20260924_079_event_sponsors.sql, not yet
 * applied as of this writing). Fetched in a SEPARATE best-effort query (see
 * loadSponsors) rather than folded into the main events select above, so
 * this page keeps working — sponsors section just stays empty — if it
 * deploys before 079 lands and `sponsors` doesn't exist on the table yet. */
type Sponsor = {
    name: string;
    logo_url: string;
    url: string | null;
    role: string | null;
    note: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadEvent(
    id: string,
): Promise<{ event: EventRow; attendees: Attendee[]; spotsLeft: number | null; sponsors: Sponsor[] } | null> {
    if (!UUID_RE.test(id)) return null;
    const supabase = getSupabaseAdmin();
    const { data: evRaw, error: evError } = await supabase
        .from('events')
        .select(
            `id, shop_id, host_id, code, type, title, description, location_name, location_detail,
             lat, lng, sector_code, hero_image_url, start_at, time_zone, capacity, attending_count,
             visibility, is_official, cancelled_at, tags, rsvp_mode, reservation_policy,
             route_plan, destination_name, destination_lat, destination_lng,
             host:profiles!events_host_id_fkey(handle, display_name, is_verified),
             shop:shops!events_shop_id_fkey(slug)`,
        )
        .eq('id', id)
        .maybeSingle();
    if (evError) console.error('[event/[id]] event load failed:', evError.message);

    const ev = evRaw as EventRow | null;
    if (!ev) return null;
    if (ev.visibility !== 'public') {
        const canSee = await viewerCanSeeNonPublicEvent(ev);
        if (!canSee) return null;
    }

    const { data: rsvpRaw, error: rsvpError } = await supabase
        .from('event_rsvps')
        .select('profile_id, rsvped_at, profile:profiles!event_rsvps_profile_id_fkey(handle, display_name, avatar_url)')
        .eq('event_id', id)
        .eq('status', 'going')
        .eq('hold_state', 'confirmed') // paid (or free) only — no unpaid 15-min holds (085)
        .order('rsvped_at', { ascending: false })
        .limit(12);
    if (rsvpError) console.error('[event/[id]] attendees load failed:', rsvpError.message);

    const attendees: Attendee[] = ((rsvpRaw as any[]) ?? [])
        .map((r) => ({
            profile_id: r.profile_id,
            handle: r.profile?.handle ?? '',
            display_name: r.profile?.display_name ?? r.profile?.handle ?? 'Member',
            avatar_url: r.profile?.avatar_url ?? null,
        }))
        .filter((a) => a.handle);

    // attending_count is PAID/confirmed only (085); spots left must also
    // subtract live 15-minute holds, which event_cards.spots_left computes.
    // Falls back to the old math if the card row is missing.
    let spotsLeft: number | null = null;
    if (ev.capacity != null) {
        const { data: card } = await supabase.from('event_cards').select('spots_left').eq('id', id).maybeSingle();
        const live = (card as { spots_left?: number | null } | null)?.spots_left;
        spotsLeft = typeof live === 'number' ? Math.max(live, 0) : Math.max(ev.capacity - (ev.attending_count ?? 0), 0);
    }

    const sponsors = await loadSponsors(supabase, id);

    return { event: ev, attendees, spotsLeft, sponsors };
}

/** Best-effort sponsors fetch, kept OUT of the main events select above on
 * purpose: `sponsors` (migration 079) may not exist on the table yet at
 * deploy time. Any error here (missing column, RLS hiccup, etc.) is
 * swallowed and treated as "no sponsors" — never blocks the page. */
async function loadSponsors(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    id: string,
): Promise<Sponsor[]> {
    try {
        const { data, error } = await supabase.from('events').select('sponsors').eq('id', id).maybeSingle();
        if (error || !data) return [];
        const raw = (data as { sponsors?: unknown }).sponsors;
        if (!Array.isArray(raw)) return [];
        return raw
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
            .map((s) => ({
                name: typeof s.name === 'string' ? s.name : '',
                // Hosts can write this column directly (events_update is row-scoped),
                // so only same-site paths and http(s) URLs ever reach src/href.
                logo_url: typeof s.logo_url === 'string' && /^(https:\/\/|\/(?!\/))/i.test(s.logo_url) ? s.logo_url : '',
                url: typeof s.url === 'string' && /^https?:\/\//i.test(s.url) ? s.url : null,
                role: typeof s.role === 'string' ? s.role : null,
                note: typeof s.note === 'string' ? s.note : null,
            }))
            .filter((s) => s.name && s.logo_url);
    } catch (err) {
        console.error('[event/[id]] sponsors load failed (non-fatal):', err);
        return [];
    }
}

type MyRsvp = {
    isLoggedIn: boolean;
    state: RsvpState;
    spotNo: number | null;
    waitlistPosition: number | null;
    /** Tier the member reserved on (tiered/paid events; null on free events). */
    tierId: string | null;
    /** Live paid-tier hold deadline (state === 'held' only). */
    holdExpiresAt: string | null;
};

const NO_RSVP: Omit<MyRsvp, 'isLoggedIn'> = {
    state: null,
    spotNo: null,
    waitlistPosition: null,
    tierId: null,
    holdExpiresAt: null,
};

/** The signed-in member's current RSVP for this event, resolved to E0/E3 state. */
/**
 * May THIS viewer manage the event's shop? The manage link used to render for
 * everyone with only its destination gated, so a signed-out visitor was invited
 * into a console they cannot open — and told a shop console lives at that path.
 * Non-redirecting on purpose: this is a public page.
 */
const EVENT_MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

async function viewerCanManageShop(shopId: number | null | undefined): Promise<boolean> {
    if (!shopId) return false;
    const me = await getConsumerProfile();
    if (!me) return false;
    const admin = getSupabaseAdmin();
    const { data: padmin } = await admin
        .from('platform_admins')
        .select('profile_id')
        .eq('profile_id', me.profileId)
        .maybeSingle();
    if (padmin) return true;
    const { data: m } = await admin
        .from('shop_memberships')
        .select('role')
        .eq('profile_id', me.profileId)
        .eq('shop_id', shopId)
        .maybeSingle();
    return EVENT_MANAGER_ROLES.has(String((m as any)?.role ?? ''));
}

async function loadMyRsvp(eventId: string): Promise<MyRsvp> {
    const me = await getConsumerProfile();
    if (!me) return { isLoggedIn: false, ...NO_RSVP };
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('event_rsvps')
        .select('status, hold_state, spot_no, rsvped_at, tier_id, hold_expires_at')
        .eq('event_id', eventId)
        .eq('profile_id', me.profileId)
        .maybeSingle();
    if (error) console.error('[event/[id]] loadMyRsvp failed:', error.message);

    const status = (data as any)?.status as string | undefined;
    const hold = (data as any)?.hold_state as string | undefined;
    const tierId = ((data as any)?.tier_id as string | undefined) ?? null;
    const holdExpiresAt = ((data as any)?.hold_expires_at as string | undefined) ?? null;

    if (status === 'going' && hold === 'held') {
        // E3: a LIVE hold (payment pending) surfaces as 'held' so the tier UI
        // shows the countdown + complete-payment path. An expired hold renders
        // as no RSVP (the backend reaper frees it; the member simply retries).
        // Legacy held rows without a deadline keep the pre-E3 confirmed read.
        if (holdExpiresAt == null) {
            return { isLoggedIn: true, state: 'confirmed', spotNo: (data as any)?.spot_no ?? null, waitlistPosition: null, tierId, holdExpiresAt: null };
        }
        if (new Date(holdExpiresAt).getTime() > Date.now()) {
            return { isLoggedIn: true, state: 'held', spotNo: (data as any)?.spot_no ?? null, waitlistPosition: null, tierId, holdExpiresAt };
        }
        return { isLoggedIn: true, ...NO_RSVP };
    }
    if (status === 'going' && hold === 'confirmed') {
        return { isLoggedIn: true, state: 'confirmed', spotNo: (data as any)?.spot_no ?? null, waitlistPosition: null, tierId, holdExpiresAt: null };
    }
    if (hold === 'waitlisted') {
        // Position in line = count of waitlisted rows joined at/before this one.
        const { count } = await supabase
            .from('event_rsvps')
            .select('profile_id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('hold_state', 'waitlisted')
            .lte('rsvped_at', (data as any)?.rsvped_at);
        return { isLoggedIn: true, state: 'waitlisted', spotNo: null, waitlistPosition: count ?? null, tierId, holdExpiresAt: null };
    }
    if (status === 'maybe') return { isLoggedIn: true, ...NO_RSVP, state: 'maybe' };
    if (status === 'declined') return { isLoggedIn: true, ...NO_RSVP, state: 'declined' };
    return { isLoggedIn: true, ...NO_RSVP };
}

/**
 * Active tiers for a tiered/paid event (public-facing card data), sorted by
 * the composer's sort order. Sub-cap remaining is computed from live occupancy
 * (confirmed + held rows count against the cap; waitlisted don't).
 */
async function loadTiers(eventId: string): Promise<TierView[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('event_tiers')
        .select('id, name, price_cents, currency, capacity, reserved_spot, includes, package_mode, package_price_cents, medusa_product_id, sort')
        .eq('event_id', eventId)
        .eq('active', true)
        .order('sort', { ascending: true });
    if (error) {
        console.error('[event/[id]] loadTiers failed:', error.message);
        return [];
    }
    const tiers = (data as any[]) ?? [];
    if (tiers.length === 0) return [];

    // Product photos for paid tiers (best-effort — see event-tier-images.ts).
    // A tier with no medusa_product_id or whose product fetch failed simply
    // gets `image: null` and the card renders without one.
    const imagesByProduct = await fetchEventTierProductImages(
        tiers.map((t) => t.medusa_product_id as string | null),
    );

    // Per-tier occupancy for sub-capped tiers, in one query. Multi-ticket
    // packages (migration 080) add event_rsvps.seats (1..5, buyer's row
    // carries the party size) — occupancy must SUM seats, not count rows, or
    // a party of 5 on one row only counts as 1. Before 080 lands the column
    // doesn't exist yet, so the first attempt (with `seats`) can fail with an
    // "unknown column" error; that retries WITHOUT it and treats every row as
    // 1 seat — today's exact behaviour. A row whose `seats` comes back
    // null/0 (legacy data even after the column exists) also falls back to 1.
    const capped = tiers.filter((t) => t.capacity != null);
    const usedByTier = new Map<string, number>();
    if (capped.length > 0) {
        let occRows: any[] | null = null;
        const withSeats = await supabase
            .from('event_rsvps')
            .select('tier_id, hold_state, seats')
            .eq('event_id', eventId)
            .eq('status', 'going')
            .in('hold_state', ['confirmed', 'held'])
            .in('tier_id', capped.map((t) => t.id));
        if (!withSeats.error) {
            occRows = (withSeats.data as any[]) ?? [];
        } else {
            console.error('[event/[id]] tier occupancy (seats) load failed, falling back to row-count:', withSeats.error.message);
            const fallback = await supabase
                .from('event_rsvps')
                .select('tier_id, hold_state')
                .eq('event_id', eventId)
                .eq('status', 'going')
                .in('hold_state', ['confirmed', 'held'])
                .in('tier_id', capped.map((t) => t.id));
            if (fallback.error) console.error('[event/[id]] tier occupancy load failed:', fallback.error.message);
            occRows = (fallback.data as any[]) ?? [];
        }
        for (const r of occRows ?? []) {
            if (!r.tier_id) continue;
            const seats = Number(r.seats ?? 1) || 1;
            usedByTier.set(r.tier_id, (usedByTier.get(r.tier_id) ?? 0) + seats);
        }
    }

    return tiers.map((t) => ({
        id: t.id,
        name: t.name ?? 'Tier',
        priceCents: Number(t.price_cents ?? 0),
        currency: t.currency ?? 'usd',
        capacity: t.capacity != null ? Number(t.capacity) : null,
        remaining:
            t.capacity != null
                ? Math.max(Number(t.capacity) - (usedByTier.get(t.id) ?? 0), 0)
                : null,
        reservedSpot: Boolean(t.reserved_spot),
        includes: Array.isArray(t.includes) ? t.includes.filter(Boolean) : [],
        packageMode: (t.package_mode ?? 'none') as TierView['packageMode'],
        packagePriceCents: t.package_price_cents != null ? Number(t.package_price_cents) : null,
        purchasable: Boolean(t.medusa_product_id),
        image: t.medusa_product_id ? (imagesByProduct[t.medusa_product_id] ?? null) : null,
    }));
}

type HostChip = { name: string; handle: string | null };

/** Accepted co-host shops for the "hosted by" chips (host + co-hosts). */
async function loadCoHostChips(eventId: string): Promise<HostChip[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('event_cohosts')
        .select('shop_id, invited_at, shop:shops!event_cohosts_shop_id_fkey(name)')
        .eq('event_id', eventId)
        .eq('status', 'accepted')
        .order('invited_at', { ascending: true });
    if (error) console.error('[event/[id]] loadCoHostChips failed:', error.message);
    const rows = (data as any[]) ?? [];
    if (rows.length === 0) return [];
    const shopIds = rows.map((r) => r.shop_id);
    const { data: pages, error: pagesError } = await supabase
        .from('profiles')
        .select('shop_id, handle')
        .in('shop_id', shopIds)
        .eq('kind', 'shop_page');
    if (pagesError) console.error('[event/[id]] loadCoHostChips pages failed:', pagesError.message);
    const handleByShop = new Map<number, string>();
    for (const p of (pages as any[]) ?? []) handleByShop.set(p.shop_id, p.handle);
    return rows.map((r) => ({
        name: r.shop?.name ?? 'Shop',
        handle: handleByShop.get(r.shop_id) ?? null,
    }));
}

function formatDate(iso: string | null, timeZone?: string | null | undefined): string {
    if (!iso) return 'Date TBA';
    try {
        return (
            formatEventTime(iso, timeZone)
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
    const { event: ev, sponsors } = data;

    const cancelledPrefix = ev.cancelled_at ? '[Cancelled] ' : '';
    // The root layout's title template already appends ' · Rollout'. Appending
    // it here too produced "… · Rollout · Rollout" in the tab and in shares.
    // openGraph/twitter titles do NOT go through the template, so they carry
    // the suffix explicitly.
    const title = `${cancelledPrefix}${ev.title ?? 'Car meet'}`;
    const socialTitle = `${title} · Rollout`;
    const baseDesc = ev.description
        ? truncate(ev.description, 160)
        : `${ev.type ?? 'Meet'} at ${ev.location_name ?? 'TBA'} — ${formatDate(ev.start_at, ev.time_zone)}. RSVP on Rollout.`;
    const sponsorSuffix =
        sponsors.length > 0 ? ` Sponsored by ${sponsors.map((s) => s.name).join(', ')}.` : '';
    const desc = `${baseDesc}${sponsorSuffix}`;
    const images = [resolveCover(ev.hero_image_url, ev.type, ev.id)];

    return {
        title,
        description: desc,
        // Non-public events are only reachable by an authorised viewer (see
        // viewerCanSeeNonPublicEvent above) — keep them out of search results
        // and link previews all the same. sitemap.ts already excludes them.
        ...(ev.visibility !== 'public' ? { robots: { index: false, follow: false } } : {}),
        openGraph: { title: socialTitle, description: desc, images, type: 'website' },
        twitter: { card: 'summary_large_image', title: socialTitle, description: desc, images },
    };
}

export default async function PublicEventPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ invite?: string }>;
}) {
    const { id } = await params;
    const { invite } = await searchParams;
    const inviteToken = typeof invite === 'string' && invite.trim() ? invite.trim() : null;
    const data = await loadEvent(id);
    if (!data) notFound();
    const { event: ev, attendees, spotsLeft, sponsors } = data;
    // E2/E3: tiered/paid events swap the flat RSVP strip for the tier picker.
    // Every pre-E2 event is rsvp_mode='free' and renders exactly as before.
    const isTiered = ev.rsvp_mode === 'tiered' || ev.rsvp_mode === 'paid';

    // ROUTE PREVIEW: only a host-planned itinerary (route_plan non-empty)
    // renders the section — a bare start+destination with no stops is just
    // the existing LOCATION pin, not a "planned route" (rule: section is
    // gated on route_plan being a non-empty array).
    //
    // parseRoutePlan already sorts by `seq` ascending — the field the data
    // model calls authoritative for order (host-authored spacing like
    // 10/20/30). `eta_local` is separate, host-typed free text and can read
    // out of chronological order (a host's own estimate was off) without
    // that being a sort bug: seq order is what both this itinerary list AND
    // the map's numbered markers (buildRoutePoints, which independently
    // re-sorts by seq too) render by. Both consumers read directly off this
    // one sorted array — nothing downstream re-sorts by name/lat/eta/OSRM
    // waypoint order.
    const routeStops = parseRoutePlan(ev.route_plan);
    const hasRoutePlan = routeStops.length > 0;
    const routePoints = hasRoutePlan
        ? buildRoutePoints({
              startLat: ev.lat,
              startLng: ev.lng,
              startName: ev.location_name,
              stops: routeStops,
              destLat: ev.destination_lat,
              destLng: ev.destination_lng,
              destName: ev.destination_name,
          })
        : [];
    const routeGoogleMaps = hasRoutePlan ? buildGoogleMapsDirUrl(routePoints) : null;

    const [myRsvp, coHostChips, tiers, routePolyline, ticketsEnabled] = await Promise.all([
        loadMyRsvp(id),
        loadCoHostChips(id),
        isTiered ? loadTiers(id) : Promise.resolve([] as TierView[]),
        // One server-side OSRM request per render (Data Cache dedupes it for
        // an hour — see route-osrm.ts). Skipped entirely when there's no
        // route plan to draw, or fewer than two points to route between.
        hasRoutePlan && routePoints.length >= 2
            ? fetchDrivingPolyline(routePoints.map((p) => [p.lat, p.lng] as LatLng))
            : Promise.resolve(null),
        multiTicketsEnabled(),
    ]);
    // Multi-ticket packages (feature-gated): the buyer's own individual seats
    // for THIS event, shown as "YOU'RE IN · N TICKETS" below the tier picker.
    // Disabled → always [] → the block never renders → today's page is
    // pixel-identical.
    const myTickets = ticketsEnabled && myRsvp.isLoggedIn ? await myTicketsForEvent(id) : [];
    const { isLoggedIn, state: myState, spotNo: mySpotNo, waitlistPosition: myWaitPos } = myRsvp;
    const rsvpReturnPath = inviteToken
        ? `/event/${id}?invite=${encodeURIComponent(inviteToken)}`
        : `/event/${id}`;

    const isCancelled = !!ev.cancelled_at;
    const isPast = !!ev.start_at && new Date(ev.start_at).getTime() < Date.now();
    const rsvpOpen = !isCancelled && !isPast;

    const hostHandle = ev.host?.handle ?? '';
    const hostName = ev.host?.display_name ?? '';
    const hostVerified = !!ev.host?.is_verified;
    const shopSlug = ev.shop?.slug ?? null;
    const canManageThisEvent = await viewerCanManageShop(ev.shop_id);

    const coverUrl = resolveCover(ev.hero_image_url, ev.type, ev.id);
    // Poster mode: only a truly custom pinned image (a host's flyer/poster) —
    // never one of our default covers, shipped or bucket. The hero component
    // still falls back to full-bleed on the client if it turns out landscape.
    const pinnedHero = ev.hero_image_url?.trim() || null;
    const posterUrl = pinnedHero && !isDefaultCoverUrl(pinnedHero) ? pinnedHero : null;
    const heroBg = `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.92) 100%), url(${coverUrl}) center/cover no-repeat`;

    const mapsUrl = ev.lat != null && ev.lng != null ? `https://www.google.com/maps?q=${ev.lat},${ev.lng}` : null;

    const calUrl = rsvpOpen ? googleCalUrl(ev) : null;
    const remaining = attendees.length < (ev.attending_count ?? 0) ? (ev.attending_count ?? 0) - attendees.length : 0;
    const shareUrl = `https://rollout.club/event/${ev.id}`;
    const shareTitle = ev.title ?? 'Car meet on Rollout';

    // Cover Story B masthead "issue bar" — both lines derived from event data:
    //   "VOL. 01 · NO. <month> — <MON YYYY> ISSUE"  (event month, in its zone)
    //   "ROLLOUT.CLUB / EVENTS / <title slug, or short id>"
    const issueMonth = (() => {
        if (!ev.start_at) return null;
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: ev.time_zone ?? undefined,
                month: 'numeric',
                year: 'numeric',
            }).formatToParts(new Date(ev.start_at));
            const month = Number(parts.find((p) => p.type === 'month')?.value);
            const year = parts.find((p) => p.type === 'year')?.value;
            if (!month || !year) return null;
            const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][month - 1];
            return { no: String(month).padStart(2, '0'), label: `${mon} ${year}` };
        } catch {
            return null;
        }
    })();
    const issueLine = issueMonth
        ? `VOL. 01 · NO. ${issueMonth.no} — ${issueMonth.label} ISSUE`
        : 'VOL. 01 · SPECIAL ISSUE';
    // Whole words only, up to ~28 chars (never cut mid-word).
    const titleSlug = (() => {
        let slug = '';
        for (const w of (ev.title ?? '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)) {
            const next = slug ? `${slug}-${w}` : w;
            if (next.length > 28) break;
            slug = next;
        }
        return slug;
    })();
    const issuePath = `ROLLOUT.CLUB / EVENTS / ${titleSlug || ev.id.slice(0, 8).toUpperCase()}`;

    // Hero ADDRESS shows only the address itself: location_detail often
    // carries notes after it ("… — parking lot. Meet 9:00 …"), so cut at the
    // first " — " or ". ". The LOCATION section below still shows it in full.
    const heroAddress = ev.location_detail?.split(/ — |\. /)[0].trim() || null;

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
        image: [coverUrl],
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


            {/* COVER HERO */}
            <EventCoverHero
                title={(ev.title ?? 'Car meet').toUpperCase()}
                code={ev.code}
                isOfficial={!!ev.is_official}
                coverUrl={coverUrl}
                isCancelled={isCancelled}
                dateLabel={formatDate(ev.start_at, ev.time_zone)}
                locationName={ev.location_name ?? 'Location TBA'}
                address={heroAddress}
                hostName={hostName}
                hostHandle={hostHandle}
                hostVerified={hostVerified}
                coHostChips={coHostChips}
                tags={ev.tags ?? []}
                startAt={ev.start_at}
                rsvpOpen={rsvpOpen}
                issueLine={issueLine}
                issuePath={issuePath}
                posterUrl={posterUrl}
            />

            <div className={styles.page}>
                {/* STATS */}
                <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', padding: '32px 0' }}>
                    <div className="container">
                        <StatBand attending={ev.attending_count ?? 0} capacity={ev.capacity} spotsLeft={spotsLeft} />
                    </div>
                </section>

                {/* SPONSORS */}
                {sponsors.length > 0 ? (
                    <section className={`section ${styles.section}`}>
                        <div className="container">
                            <div className={styles.sectionEyebrow}>／ SPONSORS</div>
                            <SponsorsSection sponsors={sponsors} />
                        </div>
                    </section>
                ) : null}

                {/* RSVP / TICKET CARD */}
                <section className={`section ${styles.section}`} style={{ textAlign: 'center' }}>
                    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 26, alignItems: 'center' }}>
                        <div className={styles.sectionEyebrow} style={{ width: '100%', maxWidth: isTiered ? undefined : 760 }}>
                            ／ {isTiered ? 'RESERVE' : 'RSVP'}
                        </div>
                        {rsvpOpen && isTiered && tiers.length > 0 ? (
                            // Tier events: each tier card IS the coupon (see TiersSection /
                            // .tierCard) — no outer TicketCard frame, so no double border.
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
                                    <TiersSection
                                        eventId={ev.id}
                                        tiers={tiers}
                                        eventStartAt={ev.start_at}
                                        eventTimeZone={ev.time_zone}
                                        reservationPolicy={ev.reservation_policy}
                                        isLoggedIn={isLoggedIn}
                                        initialState={myState}
                                        initialTierId={myRsvp.tierId}
                                        initialSpotNo={mySpotNo}
                                        initialWaitlistPosition={myWaitPos}
                                        initialHoldExpiresAt={myRsvp.holdExpiresAt}
                                        nextPath={rsvpReturnPath}
                                        inviteToken={inviteToken}
                                        ticketsEnabled={ticketsEnabled}
                                        hasTicketOrder={myTickets.some((t) => !isDeadTicketStatus(t.status))}
                                    />
                                    {myTickets.length > 0 ? (
                                        <MyTicketsPanel eventId={ev.id} tickets={myTickets} reservationPolicy={ev.reservation_policy} eventStartAt={ev.start_at} eventTimeZone={ev.time_zone} />
                                    ) : null}
                            </div>
                        ) : rsvpOpen ? (
                            <TicketCard>
                                <RsvpControls
                                    eventId={ev.id}
                                    isLoggedIn={isLoggedIn}
                                    initialState={myState}
                                    initialSpotNo={mySpotNo}
                                    initialWaitlistPosition={myWaitPos}
                                    nextPath={rsvpReturnPath}
                                    inviteToken={inviteToken}
                                />
                            </TicketCard>
                        ) : (
                            <p
                                className="text-muted"
                                style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', margin: 0 }}
                            >
                                {isCancelled ? 'THIS MEET WAS CANCELLED' : 'THIS MEET HAS ALREADY HAPPENED'}
                            </p>
                        )}

                        <ShareBar url={shareUrl} title={shareTitle} />
                    </div>
                </section>

                {/* THE COVER STORY — event brief */}
                {ev.description ? (
                    <section className={`section ${styles.section}`}>
                        <div className="container container-narrow">
                            <div className={styles.sectionEyebrow}>／ THE COVER STORY</div>
                            <CoverStoryBrief description={ev.description} />
                        </div>
                    </section>
                ) : null}

                {/* CONVOY — attendee preview (existing feature, not in the mockup's
                    section list; placed right after the ticket card) */}
                {attendees.length > 0 || (ev.attending_count ?? 0) > 0 ? (
                    <section className={`section ${styles.section}`} style={{ background: 'var(--bg-1)' }}>
                        <div className="container">
                            <div className={styles.sectionEyebrow}>／ CONVOY</div>
                            <h2 className={styles.sectionTitle}>WHO&apos;S GOING</h2>
                            <ConvoySection attendees={attendees} attendingCount={ev.attending_count ?? 0} remaining={remaining} />
                        </div>
                    </section>
                ) : null}

                {/* LOCATION — meet-point map (existing feature; kept ahead of the
                    planned-itinerary ROUTE section below, which only renders when
                    the host actually planned stops) */}
                <section className={`section ${styles.section}`}>
                    <div className="container">
                        <div className={styles.sectionEyebrow}>／ LOCATION</div>
                        <h2 className={styles.sectionTitle}>{(ev.location_name ?? 'TBA').toUpperCase()}</h2>
                        {ev.location_detail ? <p className="text-dim" style={{ fontSize: 14, margin: '0 0 18px' }}>{ev.location_detail}</p> : null}

                        {/* One map style everywhere: a planned route already shows the
                            meet point (S) on the ROUTE map below, so no second map here;
                            otherwise the same dark MapLibre map with one gold meet pin. */}
                        {ev.lat != null && ev.lng != null && !hasRoutePlan ? (
                            <div className="corner-wrap" style={{ position: "relative", marginTop: 12, aspectRatio: "16 / 7", minHeight: 260, maxWidth: "100%", background: "var(--bg-2)", border: "1px solid var(--line)", overflow: "hidden" }}>
                                <span className="corner-bottom-left" />
                                <span className="corner-bottom-right" />
                                <RouteMapLoader
                                    meetOnly
                                    points={[{ kind: "start", label: "", name: ev.location_name ?? "Meet point", lat: ev.lat, lng: ev.lng }]}
                                    polyline={[]}
                                />
                            </div>
                        ) : null}
                        {hasRoutePlan && ev.lat != null && ev.lng != null ? (
                            <p className="text-dim" style={{ fontSize: 12, margin: "4px 0 0", fontFamily: "var(--font-display)", letterSpacing: "var(--track-wider)" }}>
                                MEET POINT = S ON THE ROUTE MAP BELOW
                            </p>
                        ) : null}

                        {hasDrawnRoute(ev) ? (
                            <div className="map-stage map-stage-loc corner-wrap" style={{ marginTop: 20 }}>
                                <span className="corner-bottom-left" />
                                <span className="corner-bottom-right" />
                                <StylisedMap crop="loc" route pins={[{ x: 940, y: 462, hi: true }]} className="map-stage-desktop" />
                                <StylisedMap crop="loc-p" route pins={[{ x: 940, y: 462, hi: true }]} className="map-stage-phone" />
                                <div className="map-key mono-row">
                                    <i>
                                        <u />
                                        MEET POINT
                                    </i>
                                    <i className="k-rt">
                                        <u />
                                        ROUTE
                                    </i>
                                </div>
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

                {/* ROUTE — host-planned itinerary (mockup's "feature story" route spread) */}
                {hasRoutePlan ? (
                    <section className={`section ${styles.section}`}>
                        <div className="container">
                            <div className={styles.sectionEyebrow}>／ ROUTE</div>
                            <h2 className={styles.sectionTitle}>PLANNED ITINERARY</h2>
                            <RouteSection
                                routeStops={routeStops}
                                routePoints={routePoints}
                                polyline={routePolyline?.coords ?? routePoints.map((p) => [p.lat, p.lng] as [number, number])}
                                startLabel={formatDate(ev.start_at, ev.time_zone)}
                                startName={ev.location_name ?? 'Start'}
                                destinationName={ev.destination_name}
                                hasDestination={routePoints.some((p) => p.kind === 'destination')}
                                googleMapsUrl={routeGoogleMaps?.url ?? null}
                            />
                        </div>
                    </section>
                ) : null}

                {/* HOST */}
                {hostName ? (
                    <section className={`section ${styles.section}`} style={{ background: 'var(--bg-1)' }}>
                        <div className="container container-narrow">
                            <div className={styles.sectionEyebrow}>／ HOSTED BY</div>
                            <HostBlock hostName={hostName} hostHandle={hostHandle} hostVerified={hostVerified} />
                        </div>
                    </section>
                ) : null}

                {/* CALENDAR / SHARE ACTIONS */}
                <section className={`section ${styles.section}`} style={{ textAlign: 'center' }}>
                    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
                        <div className={styles.sectionEyebrow} style={{ justifyContent: 'center', width: '100%', maxWidth: 500 }}>
                            ／ SAVE THE DATE
                        </div>
                        <ActionsToolbar
                            calUrl={calUrl}
                            icsUrl={rsvpOpen ? `/event/${ev.id}/ics` : null}
                            manageHref={shopSlug && canManageThisEvent ? `/shop/${shopSlug}/events/${ev.id}` : null}
                        />
                    </div>
                </section>
            </div>
        </>
    );
}
