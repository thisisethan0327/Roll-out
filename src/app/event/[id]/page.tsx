/**
 * /event/[id] — public event page for shareable links + SEO, now with web RSVP.
 *
 * Loads from the base rollout.events table (via the service-role client) so
 * PAST and CANCELLED public events still render with the right banner — the
 * event_cards view hides cancelled rows, which is wrong for a shareable link.
 *
 * A public event renders for anyone. A non-public event (followers/private)
 * renders in full only for a viewer rollout._can_view_event() lets in (host,
 * shop staff, platform admin, invitee, follower for followers-only) — see
 * lib/event-viewer.ts's resolveEventAccess, which falls back to the legacy
 * rule in lib/event-visibility.ts until migration 088 is deployed. Everyone
 * else gets the LOCKED teaser (LockedEvent.tsx, built only from
 * rollout.event_teasers) when the event is upcoming, or notFound() otherwise
 * (the layout owns that 404 status). ?invite=<token> is claimed BEFORE that
 * decision for a signed-in viewer, so the invite unlocks the page on the same
 * request. The RSVP RPCs still enforce who may RSVP on their own. Non-public
 * events carry `robots: noindex` (see generateMetadata) and are excluded from
 * sitemap.ts, which only lists visibility='public' rows.
 *
 * Logged-in members RSVP inline (RLS-enforced writes); signed-out members get
 * a sign-in CTA that returns here. JSON-LD Event structured data keeps public
 * meets indexable + rich-previewable.
 */
import type { Metadata } from 'next';
import { formatEventTime } from '@/lib/event-time';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
    BadgeCheck,
    CalendarDays,
    CircleDot,
    CircleX,
    Download,
    Flag,
    Lock,
    Map as MapIcon,
    MapPin,
    Navigation,
    Route,
    Settings2,
    Ticket,
    UserRound,
    Users,
} from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getConsumerProfile } from '@/lib/consumer';
import { resolveEventAccess } from '@/lib/event-viewer';
import { lockedSignInHref, safeInviteToken } from '@/lib/event-teaser-format';
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
import RouteMapLoader from './RouteMapLoader';
import { SponsorsSection } from './SponsorsSection';
import { Countdown } from './Countdown';
import { LockedEvent } from './LockedEvent';
import { ROLLOUT_ORIGIN } from '@/lib/tenant-hosts';
import { absoluteUrl, jsonLdHtml, postalAddressFromText } from '@/lib/structured-data';
import { isSeedEvent } from '@/lib/seed-content';
import { GlideAnnouncements } from '@/components/glide-tickets/GlideAnnouncements';
import { getEventAnnouncements, getSiteAnnouncements } from '@/lib/announcements';
import { sortAnnouncements } from '@/lib/announcements-core';
import { eventDateParts, eventTypeLabel, placeName } from '@/lib/glide-format';
import { Card, Chip, DateRoundel, Row, SecButton, SpotsBar } from '@/components/glide/primitives';

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
    host: { handle: string | null; display_name: string | null; is_verified: boolean | null; kind: string | null } | null;
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

/**
 * The FULL event row + attendees. Only ever called after resolveEventAccess()
 * returned 'full' for this viewer — it no longer re-checks visibility itself.
 */
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
             host:profiles!events_host_id_fkey(handle, display_name, is_verified, kind),
             shop:shops!events_shop_id_fkey(slug)`,
        )
        .eq('id', id)
        .maybeSingle();
    if (evError) console.error('[event/[id]] event load failed:', evError.message);

    const ev = evRaw as EventRow | null;
    if (!ev) return null;

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

    // 087 "not included" note, fetched separately so the card still renders if
    // the column isn't there yet (a missing column would fail the query above).
    const notIncluded = new Map<string, string>();
    try {
        const { data: notes, error: notesErr } = await supabase
            .from('event_tiers')
            .select('id, not_included')
            .in('id', tiers.map((t) => t.id));
        if (!notesErr) {
            for (const n of (notes as any[]) ?? []) {
                if (typeof n.not_included === 'string' && n.not_included.trim()) notIncluded.set(n.id, n.not_included.trim());
            }
        }
    } catch {
        /* no note */
    }

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
        notIncluded: notIncluded.get(t.id) ?? null,
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
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ invite?: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const { invite } = await searchParams;
    const access = await resolveEventAccess(id, safeInviteToken(invite));
    if (access.kind === 'missing') return { title: 'Event not found' };
    if (access.kind === 'locked') {
        // Nothing about a locked event goes into metadata — no title, venue or
        // description in the tab, search results or link previews.
        const lockedTitle = 'Private event';
        return {
            title: lockedTitle,
            description: 'An invite-only event on Rollout.',
            robots: { index: false, follow: false },
            openGraph: { title: `${lockedTitle} · Rollout`, description: 'An invite-only event on Rollout.', type: 'website' },
            twitter: { card: 'summary', title: `${lockedTitle} · Rollout`, description: 'An invite-only event on Rollout.' },
        };
    }
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
    // Only a CRITICAL live notice reaches link previews / search snippets
    // (info and warning stay on the page itself) — keep SEO sane.
    const critical = (await getEventAnnouncements(id)).find((a) => a.level === 'critical');
    const updatePrefix = critical ? `[Update] ${truncate(critical.title, 90)}. ` : '';
    const desc = `${updatePrefix}${baseDesc}${sponsorSuffix}`;
    const images = [resolveCover(ev.hero_image_url, ev.type, ev.id)];

    return {
        title,
        description: desc,
        // Non-public events are only reachable by an authorised viewer (see
        // viewerCanViewEvent) — keep them out of search results
        // and link previews all the same. sitemap.ts already excludes them.
        // Preview seed meets (lib/seed-content) are not real events: out of search too.
        ...(ev.visibility !== 'public' || isSeedEvent(ev) ? { robots: { index: false, follow: false } } : {}),
        // Self-canonical without ?invite: an invite link is the same page.
        alternates: { canonical: `/event/${ev.id}` },
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
    // Claim ?invite (signed in) THEN decide full / locked / 404 — see header.
    const access = await resolveEventAccess(id, safeInviteToken(inviteToken));
    if (access.kind === 'missing') notFound();
    if (access.kind === 'locked') {
        return (
            <LockedEvent
                teaser={access.teaser}
                signedIn={access.signedIn}
                signInHref={lockedSignInHref(id, safeInviteToken(inviteToken))}
            />
        );
    }
    const data = await loadEvent(id);
    if (!data) notFound();
    const { event: ev, attendees, spotsLeft, sponsors } = data;
    // Live announcements: this event's, plus any site-wide CRITICAL one. The
    // viewer was authorised above, so the per-event read uses the service role.
    const [eventNotices, siteNotices] = await Promise.all([getEventAnnouncements(id), getSiteAnnouncements()]);
    const notices = sortAnnouncements([...siteNotices.filter((a) => a.level === 'critical'), ...eventNotices]);
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

    const mapsUrl = ev.lat != null && ev.lng != null ? `https://www.google.com/maps?q=${ev.lat},${ev.lng}` : null;

    const calUrl = rsvpOpen ? googleCalUrl(ev) : null;
    const remaining = attendees.length < (ev.attending_count ?? 0) ? (ev.attending_count ?? 0) - attendees.length : 0;
    const shareUrl = `https://rollout.club/event/${ev.id}`;
    const shareTitle = ev.title ?? 'Car meet on Rollout';

    // Hero ADDRESS shows only the address itself: location_detail often
    // carries notes after it ("… — parking lot. Meet 9:00 …"), so cut at the
    // first " — " or ". ". The LOCATION section below still shows it in full.
    const heroAddress = ev.location_detail?.split(/ — |\. /)[0].trim() || null;

    // Event structured data — PUBLIC, real events only. A followers-only or
    // private event renders here for the host, an invitee or a follower, and
    // its page is noindex already; the markup must not describe it either. A
    // preview seed meet (lib/seed-content) is not a real event, so it gets none.
    //
    // Everything below comes from the event's own row: the address is the same
    // first segment of location_detail the hero shows; offers are the tiers a
    // visitor can actually take (free, or paid with a product behind it — the
    // tier cards' own rule), only while RSVPs are open. There is no end time on
    // an event, so there is no endDate (the calendar links' 3-hour block is a
    // default, not data).
    const address = postalAddressFromText(heroAddress);
    const offers = rsvpOpen
        ? tiers
              .filter((t) => t.priceCents === 0 || t.purchasable)
              .map((t) => ({
                  '@type': 'Offer',
                  name: t.name,
                  price: (t.priceCents / 100).toFixed(2),
                  priceCurrency: t.currency.toUpperCase(),
                  url: shareUrl,
                  availability:
                      (t.remaining != null && t.remaining <= 0) || spotsLeft === 0
                          ? 'https://schema.org/SoldOut'
                          : 'https://schema.org/InStock',
              }))
        : [];
    const coverAbs = absoluteUrl(coverUrl);
    const jsonLd =
        ev.visibility === 'public' && !isSeedEvent(ev)
            ? {
                  '@context': 'https://schema.org',
                  '@type': 'Event',
                  name: ev.title ?? 'Car meet',
                  url: shareUrl,
                  startDate: ev.start_at ?? undefined,
                  eventStatus: isCancelled
                      ? 'https://schema.org/EventCancelled'
                      : 'https://schema.org/EventScheduled',
                  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
                  location: {
                      '@type': 'Place',
                      name: ev.location_name ?? 'TBA',
                      ...(address ? { address } : {}),
                      ...(ev.lat != null && ev.lng != null
                          ? { geo: { '@type': 'GeoCoordinates', latitude: ev.lat, longitude: ev.lng } }
                          : {}),
                  },
                  ...(coverAbs ? { image: [coverAbs] } : {}),
                  ...(ev.description ? { description: ev.description } : {}),
                  ...(hostName
                      ? {
                            organizer: {
                                '@type': ev.host?.kind === 'shop_page' ? 'Organization' : 'Person',
                                name: hostName,
                                ...(hostHandle ? { url: `${ROLLOUT_ORIGIN}/u/${hostHandle}` } : {}),
                            },
                        }
                      : {}),
                  ...(offers.length > 0 ? { offers } : {}),
              }
            : null;

    // Glide layout (docs/design/GLIDE.md; board G2 "Web event page"): the cover
    // with a floating title card, Details + Route cards below it, and a sticky
    // ticket panel + host card on the right. Every value is the row's own.
    const when = eventDateParts(ev.start_at, ev.time_zone);
    const place = placeName(ev.location_name);
    const attending = ev.attending_count ?? 0;
    const hasMeetPoint = ev.lat != null && ev.lng != null;
    const hasMapCard = hasRoutePlan || hasMeetPoint;
    const destinationLabel = routePoints.some((p) => p.kind === 'destination') ? (ev.destination_name ?? 'Destination') : null;
    // Start → finish only: stop names often carry notes, and the Route card
    // lists every stop anyway.
    const routeLine = hasRoutePlan
        ? [place ?? 'Start', destinationLabel ?? routeStops[routeStops.length - 1]?.name].filter(Boolean).join(' → ')
        : null;
    const manageHref = shopSlug && canManageThisEvent ? `/shop/${shopSlug}/events/${ev.id}` : null;
    const ic = { size: 22, strokeWidth: 1.5, 'aria-hidden': true } as const;
    const chipIc = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <div className="glide glide-page">
            <div className="g-wrap">
                {/* STATUS — cancelled or past */}
                {isCancelled || isPast ? (
                    <div className="g-ev-notes">
                        <p className="g-note" role="status">
                            {isCancelled ? <CircleX size={20} strokeWidth={2} aria-hidden="true" /> : <CircleDot size={20} strokeWidth={2} aria-hidden="true" />}
                            {isCancelled ? 'This meet has been cancelled.' : 'This meet has ended. RSVPs are closed.'}
                        </p>
                    </div>
                ) : null}

                {/* ANNOUNCEMENTS — above the cover so a postponement is the first thing read */}
                <GlideAnnouncements announcements={notices} />

                <div className="g-ev">
                    <div className="g-ev-main">
                        {/* COVER */}
                        <div className="g-ev-hero-wrap">
                            <section
                                className={`g-ev-hero${posterUrl ? ' is-poster' : ''}${isCancelled ? ' is-cancelled' : ''}`}
                                aria-labelledby="ev-title"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element -- same plain-<img> approach the page always used */}
                                <img src={posterUrl ?? coverUrl} alt={posterUrl ? `${ev.title ?? 'Event'} poster` : ''} fetchPriority="high" />
                                <div className="g-ev-hl g-fp g-edge">
                                    <h1 id="ev-title">{ev.title ?? 'Car meet'}</h1>
                                    {hostName ? (
                                        <p className="g-host">
                                            {hostHandle ? <Link href={`/u/${hostHandle}`}>{hostName}</Link> : hostName}
                                            {hostVerified ? <BadgeCheck size={17} strokeWidth={2} role="img" aria-label="Verified host" /> : null}
                                            {hostHandle ? <span>@{hostHandle}</span> : null}
                                            {coHostChips.map((c) => (
                                                <span key={c.name}>
                                                    {' '}
                                                    with {c.handle ? <Link href={`/u/${c.handle}`}>@{c.handle}</Link> : c.name}
                                                </span>
                                            ))}
                                        </p>
                                    ) : null}
                                    <div className="g-chips">
                                        {when ? (
                                            <Chip large icon={<CalendarDays {...chipIc} />}>
                                                {when.dow.charAt(0) + when.dow.slice(1).toLowerCase()} {when.mon} <span className="g-w">{when.day}</span>
                                            </Chip>
                                        ) : null}
                                        {hasRoutePlan ? (
                                            <Chip large icon={<Route {...chipIc} />}>
                                                <span className="g-w">{routeStops.length}</span> {routeStops.length === 1 ? 'stop' : 'stops'}
                                            </Chip>
                                        ) : null}
                                        {attending > 0 ? (
                                            <Chip large icon={<Users {...chipIc} />}>
                                                <span className="g-w">{attending}</span> going
                                            </Chip>
                                        ) : null}
                                    </div>
                                </div>
                                <span className="g-ev-tag g-fp">
                                    <Flag size={18} strokeWidth={1.75} aria-hidden="true" />
                                    <span>
                                        {eventTypeLabel(ev.type)}
                                        {place ? ` · ${place}` : ''}
                                    </span>
                                </span>
                            </section>
                        </div>

                        <div className={`g-ev-low${hasMapCard ? '' : ' is-single'}`}>
                            {/* DETAILS */}
                            <Card as="section" aria-labelledby="ev-details">
                                <h2 className="g-card-h" id="ev-details">
                                    Details
                                </h2>
                                <ul className="g-rows">
                                    <Row
                                        icon={<CalendarDays {...ic} />}
                                        label={when?.long ?? 'Date TBA'}
                                        sub={when ? `${when.clock} ${when.zone}` : undefined}
                                        trailing={
                                            calUrl ? (
                                                <a className="g-link" href={calUrl} target="_blank" rel="noopener noreferrer">
                                                    Add to calendar
                                                </a>
                                            ) : null
                                        }
                                    />
                                    <Row
                                        icon={<MapPin {...ic} />}
                                        label={place ?? 'Location TBA'}
                                        sub={ev.location_detail ?? undefined}
                                        trailing={
                                            mapsUrl ? (
                                                <a className="g-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                                                    Directions
                                                </a>
                                            ) : null
                                        }
                                    />
                                    {routeLine ? (
                                        <Row
                                            icon={<Route {...ic} />}
                                            label={`${routeStops.length} planned ${routeStops.length === 1 ? 'stop' : 'stops'}`}
                                            sub={routeLine}
                                        />
                                    ) : null}
                                    {ev.capacity != null ? (
                                        <Row
                                            icon={<Ticket {...ic} />}
                                            label={`${attending} of ${ev.capacity} spots`}
                                            trailing={
                                                <SpotsBar value={ev.capacity ? attending / ev.capacity : 0} label={`${attending} of ${ev.capacity} spots taken`} />
                                            }
                                        />
                                    ) : null}
                                </ul>
                                {ev.description ? <p className="g-about">{ev.description}</p> : null}
                                {(ev.tags ?? []).length > 0 ? (
                                    <div className="g-chips g-tags" role="list" aria-label="Event tags">
                                        {(ev.tags ?? []).slice(0, 8).map((tag) => (
                                            <span key={tag} role="listitem">
                                                <Chip>{tag}</Chip>
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="g-card-foot">
                                    {rsvpOpen ? (
                                        <a className="g-link" href={`/event/${ev.id}/ics`}>
                                            <Download size={16} strokeWidth={2} aria-hidden="true" />
                                            Download .ics
                                        </a>
                                    ) : null}
                                    {manageHref ? (
                                        <Link className="g-link" href={manageHref}>
                                            <Settings2 size={16} strokeWidth={2} aria-hidden="true" />
                                            Manage this event
                                        </Link>
                                    ) : null}
                                </div>
                            </Card>

                            {/* ROUTE (host-planned itinerary) or MEET POINT */}
                            {hasMapCard ? (
                                <Card as="section" aria-labelledby="ev-route">
                                    <h2 className="g-card-h" id="ev-route">
                                        {hasRoutePlan ? 'Route' : 'Meet point'}
                                    </h2>
                                    <div className="g-map">
                                        {hasRoutePlan ? (
                                            <RouteMapLoader
                                                glide
                                                points={routePoints}
                                                polyline={routePolyline?.coords ?? routePoints.map((p) => [p.lat, p.lng] as [number, number])}
                                            />
                                        ) : (
                                            <RouteMapLoader
                                                glide
                                                meetOnly
                                                points={[
                                                    {
                                                        kind: 'start',
                                                        label: '',
                                                        name: ev.location_name ?? 'Meet point',
                                                        lat: ev.lat as number,
                                                        lng: ev.lng as number,
                                                    },
                                                ]}
                                                polyline={[]}
                                            />
                                        )}
                                    </div>
                                    {hasRoutePlan ? (
                                        <ol className="g-legs" aria-label="Stops">
                                            <li>
                                                <span className="g-n" aria-hidden="true">
                                                    S
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <b>{place ?? 'Start'}</b>
                                                    <small>Meet{when ? ` · ${when.clock}` : ''}</small>
                                                </span>
                                            </li>
                                            {routeStops.map((st, i) => (
                                                <li key={`${st.seq}-${i}`}>
                                                    <span className="g-n" aria-hidden="true">
                                                        {i + 1}
                                                    </span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <b>{st.name}</b>
                                                        <small>
                                                            {st.etaLocal ?? `Stop ${i + 1}`}
                                                            {st.dwellMin != null ? ` · ${st.dwellMin} min` : ''}
                                                        </small>
                                                    </span>
                                                </li>
                                            ))}
                                            {destinationLabel ? (
                                                <li>
                                                    <span className="g-n" aria-hidden="true">
                                                        F
                                                    </span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <b>{destinationLabel}</b>
                                                        <small>Finish</small>
                                                    </span>
                                                </li>
                                            ) : null}
                                        </ol>
                                    ) : null}
                                    <div className="g-card-foot">
                                        {routeGoogleMaps?.url ? (
                                            <a className="g-link" href={routeGoogleMaps.url} target="_blank" rel="noopener noreferrer">
                                                <Navigation size={16} strokeWidth={2} aria-hidden="true" />
                                                Open the route in Google Maps
                                            </a>
                                        ) : null}
                                        <Link className="g-link" href="/meets/map">
                                            <MapIcon size={16} strokeWidth={2} aria-hidden="true" />
                                            Meets map
                                        </Link>
                                    </div>
                                </Card>
                            ) : null}
                        </div>

                        {attendees.length > 0 || attending > 0 || sponsors.length > 0 ? (
                            <div className="g-ev-more">
                                {/* WHO'S GOING */}
                                {attendees.length > 0 || attending > 0 ? (
                                    <Card as="section" aria-labelledby="ev-going">
                                        <h2 className="g-card-h" id="ev-going">
                                            Who&apos;s going
                                        </h2>
                                        <div className="g-crew">
                                            {attendees.map((a) => (
                                                <Link key={a.profile_id} href={`/u/${a.handle}`}>
                                                    <span
                                                        className="g-av"
                                                        aria-hidden="true"
                                                        style={a.avatar_url ? { backgroundImage: `url(${a.avatar_url})` } : undefined}
                                                    >
                                                        {a.avatar_url ? null : initials(a.display_name, a.handle)}
                                                    </span>
                                                    @{a.handle}
                                                </Link>
                                            ))}
                                            {remaining > 0 ? <span className="g-more">+{remaining} more</span> : null}
                                            {attendees.length === 0 ? <span className="g-more">{attending} going</span> : null}
                                        </div>
                                    </Card>
                                ) : null}

                                {/* SPONSORS */}
                                {sponsors.length > 0 ? (
                                    <Card as="section" aria-labelledby="ev-sponsors">
                                        <h2 className="g-card-h" id="ev-sponsors">
                                            Sponsors
                                        </h2>
                                        <div style={{ padding: '14px 20px 20px' }}>
                                            <SponsorsSection sponsors={sponsors} />
                                        </div>
                                    </Card>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <aside className="g-ev-side" aria-label="Tickets and host">
                        {/* TICKET PANEL */}
                        <Card as="section" className="g-panel" aria-labelledby="ev-panel">
                            <div className="g-panel-h">
                                {when ? <DateRoundel top={when.dow} day={when.day} label={when.long} /> : null}
                                <span className="g-t">
                                    <b id="ev-panel">
                                        {rsvpOpen ? (isTiered ? 'Get your ticket' : 'Get your spot') : isCancelled ? 'Cancelled' : 'RSVPs closed'}
                                    </b>
                                    {rsvpOpen ? (
                                        <small>
                                            {ev.start_at ? <Countdown startAt={ev.start_at} variant="glide" /> : null}
                                            {spotsLeft != null ? (
                                                <>
                                                    {ev.start_at ? ' · ' : ''}
                                                    <span className="g-w">{spotsLeft}</span> {spotsLeft === 1 ? 'spot' : 'spots'} left
                                                </>
                                            ) : null}
                                        </small>
                                    ) : null}
                                </span>
                            </div>
                            <div className="g-panel-body">
                                {rsvpOpen && isTiered && tiers.length > 0 ? (
                                    // Tier picker (radio cards + slide) and the buyer's seats.
                                    <div className="gt-panel-tiers">
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
                                            <MyTicketsPanel
                                                eventId={ev.id}
                                                tickets={myTickets}
                                                reservationPolicy={ev.reservation_policy}
                                                eventStartAt={ev.start_at}
                                                eventTimeZone={ev.time_zone}
                                            />
                                        ) : null}
                                    </div>
                                ) : rsvpOpen ? (
                                    <RsvpControls
                                        eventId={ev.id}
                                        isLoggedIn={isLoggedIn}
                                        initialState={myState}
                                        initialSpotNo={mySpotNo}
                                        initialWaitlistPosition={myWaitPos}
                                        nextPath={rsvpReturnPath}
                                        inviteToken={inviteToken}
                                    />
                                ) : (
                                    <p className="g-panel-closed">{isCancelled ? 'This meet was cancelled.' : 'This meet has already happened.'}</p>
                                )}
                                {rsvpOpen && isTiered ? (
                                    <p className="g-panel-line">
                                        <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
                                        No app needed. Payments by Stripe.
                                    </p>
                                ) : null}
                            </div>
                            <ShareBar url={shareUrl} title={shareTitle} />
                        </Card>

                        {/* HOST */}
                        {hostName ? (
                            <Card as="section" edge className="g-hostcard" aria-labelledby="ev-host">
                                <div className="g-hostcard-h">
                                    <span className="g-av g-av--lg" aria-hidden="true">
                                        {initials(hostName, hostHandle)}
                                    </span>
                                    <span style={{ minWidth: 0 }}>
                                        <b id="ev-host">
                                            {hostName}
                                            {hostVerified ? <BadgeCheck size={18} strokeWidth={2} role="img" aria-label="Verified host" /> : null}
                                        </b>
                                        <small>
                                            {hostHandle ? `@${hostHandle}` : 'Host'}
                                            {hostVerified ? ' · verified host' : ''}
                                        </small>
                                    </span>
                                </div>
                                {coHostChips.length > 0 ? (
                                    <div className="g-chips">
                                        {coHostChips.map((c) =>
                                            c.handle ? (
                                                <Chip key={c.name} href={`/u/${c.handle}`}>
                                                    With {c.name}
                                                </Chip>
                                            ) : (
                                                <Chip key={c.name}>With {c.name}</Chip>
                                            ),
                                        )}
                                    </div>
                                ) : null}
                                {hostHandle ? (
                                    <div className="g-hostcard-act">
                                        <SecButton href={`/u/${hostHandle}`}>
                                            <UserRound size={18} strokeWidth={1.75} aria-hidden="true" />
                                            View profile
                                        </SecButton>
                                    </div>
                                ) : null}
                            </Card>
                        ) : null}
                    </aside>
                </div>
            </div>
            {/* Structured data LAST: Next picks the segment's FIRST element to decide
                whether to scroll to the top on navigation, and an invisible <script>
                always reads as "already in view", so the page kept the previous scroll. */}
            {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} /> : null}
        </div>
    );
}
