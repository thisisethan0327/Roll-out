'use server';
/**
 * Individual-host event actions (/me/events).
 *
 * A verified host (host_status = 'verified') creates/manages their OWN events —
 * no shop attached (shop_id null, is_official false). Ownership is enforced in
 * code on every mutation: host_id must equal the caller's profile id AND
 * shop_id must be null (a host can never touch a shop-owned event here). Writes
 * use the service-role admin client (RLS bypass) after requireVerifiedHost.
 *
 * Invitations reuse the isomorphic event-invites renderer with a NEUTRAL
 * Rollout branding object and dispatch through the platform email function
 * (send-platform-notification), audited in email_log via linked_event_id.
 */
import { revalidatePath } from 'next/cache';
import { EVENT_TZ_FIELD, resolveFormZone, zonedWallClockToUtc } from '@/lib/event-time';
import { redirect } from 'next/navigation';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getRolloutMemberClient } from '@/lib/consumer';
import { eventHasPaidExposure } from '@/lib/event-refund';
import { sendPlatformNotification } from '@/lib/platform-notify';
import { parseDestinationName, parseHeroUrl } from '@/lib/host-event-parse';
import {
    renderInvite,
    type InviteBranding,
    type InviteEvent,
    type InviteStyleKey,
} from '@/lib/event-invites';

const ALLOWED_TYPES = new Set(['NIGHT_RUN', 'CAR_MEET', 'TRACK_DAY', 'CRUISE', 'SHOW']);
const ALLOWED_VIS = new Set(['public', 'followers', 'private']);
const VALID_STYLES = new Set<InviteStyleKey>(['hud', 'minimal', 'poster', 'classic']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 100;

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'NIGHT RUN',
    CAR_MEET: 'CAR MEET',
    TRACK_DAY: 'TRACK DAY',
    CRUISE: 'CRUISE',
    SHOW: 'SHOW',
};

function generateCode(type: string): string {
    const label = TYPE_LABEL[type] ?? type.replace(/_/g, ' ');
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${label} / ${n}`;
}

function parseNumber(raw: FormDataEntryValue | null): number | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function parseTags(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Load an event the caller owns (host_id = them, shop_id null). Null if not. */
async function loadOwnEvent(eventId: string, hostProfileId: string) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select(
            'id, shop_id, host_id, code, type, title, description, location_name, location_detail, start_at, cancelled_at',
        )
        .eq('id', eventId)
        .maybeSingle();
    const ev = data as any;
    if (!ev || ev.host_id !== hostProfileId || ev.shop_id != null) return null;
    return ev;
}

/** Failure shape returned by createHostEvent/updateHostEvent — matches
 * setEventRoutePlan's { ok: false, error } below. On success createHostEvent
 * redirects (never returns) and updateHostEvent returns { ok: true }; Next
 * redacts thrown Error messages from server actions in production, so form
 * input problems must come back as data, not a throw. */
export type HostEventActionResult = { ok: true } | { ok: false; error: string };

export async function createHostEvent(
    formData: FormData,
): Promise<{ ok: false; error: string } | void> {
    const profile = await requireVerifiedHost('/me/events/new');

    const type = String(formData.get('type') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const location_name = String(formData.get('location_name') ?? '').trim();
    const location_detail = String(formData.get('location_detail') ?? '').trim();
    const lat = parseNumber(formData.get('lat'));
    const lng = parseNumber(formData.get('lng'));
    const start_at_raw = String(formData.get('start_at') ?? '').trim();
    const capacity = parseNumber(formData.get('capacity'));
    const visibility = String(formData.get('visibility') ?? 'public').trim();
    const tags = parseTags(String(formData.get('tags') ?? ''));

    const heroResult = parseHeroUrl(formData.get('hero_image_url'));
    if (!heroResult.ok) return { ok: false, error: heroResult.error };
    const hero_image_url = heroResult.value;

    const destResult = parseDestinationName(formData.get('destination_name'));
    if (!destResult.ok) return { ok: false, error: destResult.error };
    const destination_name = destResult.value;

    const destination_lat = parseNumber(formData.get('destination_lat'));
    const destination_lng = parseNumber(formData.get('destination_lng'));

    if (!ALLOWED_TYPES.has(type)) return { ok: false, error: 'Invalid event type.' };
    if (title.length < 4) return { ok: false, error: 'Title must be at least 4 characters.' };
    if (description.length > 400) return { ok: false, error: 'Description must be 400 chars or fewer.' };
    if (location_name.length < 2) return { ok: false, error: 'Location name is required.' };
    if (!start_at_raw) return { ok: false, error: 'Start time is required.' };
    if (!ALLOWED_VIS.has(visibility)) return { ok: false, error: 'Invalid visibility.' };
    // The wall clock is meaningless without the zone it was typed in; the form
    // carries it. Parsing it with `new Date()` used the SERVER's zone (UTC),
    // which is what moved every meet by the offset. See lib/event-time.ts.
    const { timeZone, supplied } = resolveFormZone(formData.get(EVENT_TZ_FIELD));
    if (!supplied) {
        console.warn('[events] no %s on the form — reading the wall clock as UTC', EVENT_TZ_FIELD);
    }
    const start_at = zonedWallClockToUtc(start_at_raw, timeZone);
    if (!start_at) return { ok: false, error: 'Invalid start time.' };

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('events')
        .insert({
            shop_id: null,
            host_id: profile.profileId,
            code: generateCode(type),
            type,
            title,
            description: description || null,
            location_name,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            hero_image_url,
            destination_name,
            destination_lat,
            destination_lng,
            is_official: false,
            attending_count: 0,
        })
        .select('id')
        .single();
    if (error) return { ok: false, error: error.message };

    const newId = (data as any).id as string;
    revalidatePath('/me/events');
    revalidatePath('/meets');
    redirect(`/me/events/${newId}?just_created=1`);
}

export async function updateHostEvent(
    eventId: string,
    formData: FormData,
): Promise<HostEventActionResult> {
    const profile = await requireVerifiedHost('/me/events');
    const ev = await loadOwnEvent(eventId, profile.profileId);
    if (!ev) return { ok: false, error: 'Event not found.' };

    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const location_name = String(formData.get('location_name') ?? '').trim();
    const location_detail = String(formData.get('location_detail') ?? '').trim();
    const lat = parseNumber(formData.get('lat'));
    const lng = parseNumber(formData.get('lng'));
    const start_at_raw = String(formData.get('start_at') ?? '').trim();
    const capacity = parseNumber(formData.get('capacity'));
    const visibility = String(formData.get('visibility') ?? 'public').trim();
    const tags = parseTags(String(formData.get('tags') ?? ''));

    const heroResult = parseHeroUrl(formData.get('hero_image_url'));
    if (!heroResult.ok) return { ok: false, error: heroResult.error };
    const hero_image_url = heroResult.value;

    // Route destination (migration 076) — plain columns on events, updated
    // through this same ownership-checked write path (not the route_plan
    // RPC below, which only covers the jsonb stop array).
    const destResult = parseDestinationName(formData.get('destination_name'));
    if (!destResult.ok) return { ok: false, error: destResult.error };
    const destination_name = destResult.value;

    const destination_lat = parseNumber(formData.get('destination_lat'));
    const destination_lng = parseNumber(formData.get('destination_lng'));

    if (title.length < 4) return { ok: false, error: 'Title must be at least 4 characters.' };
    if (description.length > 400) return { ok: false, error: 'Description must be 400 chars or fewer.' };
    if (location_name.length < 2) return { ok: false, error: 'Location name is required.' };
    if (!start_at_raw) return { ok: false, error: 'Start time is required.' };
    if (!ALLOWED_VIS.has(visibility)) return { ok: false, error: 'Invalid visibility.' };
    // The wall clock is meaningless without the zone it was typed in; the form
    // carries it. Parsing it with `new Date()` used the SERVER's zone (UTC),
    // which is what moved every meet by the offset. See lib/event-time.ts.
    const { timeZone, supplied } = resolveFormZone(formData.get(EVENT_TZ_FIELD));
    if (!supplied) {
        console.warn('[events] no %s on the form — reading the wall clock as UTC', EVENT_TZ_FIELD);
    }
    const start_at = zonedWallClockToUtc(start_at_raw, timeZone);
    if (!start_at) return { ok: false, error: 'Invalid start time.' };

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({
            title,
            description: description || null,
            location_name,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            hero_image_url,
            destination_name,
            destination_lat,
            destination_lng,
            updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('host_id', profile.profileId)
        .is('shop_id', null);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/me/events');
    revalidatePath(`/me/events/${eventId}`);
    revalidatePath(`/event/${eventId}`);
    revalidatePath('/meets');
    return { ok: true };
}

// ── Route plan (migration 076) ───────────────────────────────────────────

export type RoutePlanStopInput = {
    kind: string;
    name: string;
    lat: number;
    lng: number;
    etaLocal?: string | null;
    dwellMin?: number | null;
    note?: string | null;
};

export type SetRoutePlanResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Replace this event's planned stop list. ONE call to `rollout.
 * set_event_route_plan` per save — the whole array is renumbered to
 * seq 100, 200, 300, … in list order first (the RPC requires strictly
 * ascending seq; the UI only exposes reordering, not raw seq entry).
 *
 * Runs as the SIGNED-IN HOST's own Supabase session (getRolloutMemberClient,
 * i.e. `(await getSupabaseServer()).schema('rollout')` — the exact same anon
 * SSR client event/[id]/actions.ts's RSVP writes use), NOT the service-role
 * admin client: the RPC is `security definer` and does its own host/
 * shop-manager/platform-admin check against `auth.uid()`, so it must see the
 * real caller for that check to mean anything.
 *
 * No client-side re-validation of stop shape here on purpose — the RPC is
 * the single source of truth for what a valid stop looks like (kind enum,
 * name length, lat/lng range, seq bounds) and raises `22023` naming the
 * exact bad stop ("stop N: …"); duplicating those rules here would just be
 * two copies to keep in sync. `loadOwnEvent` below is only a friendlier
 * "event not found" than the RPC's own P0002/42501 would read as inline.
 */
export async function setEventRoutePlan(
    eventId: string,
    stops: RoutePlanStopInput[],
): Promise<SetRoutePlanResult> {
    const profile = await requireVerifiedHost('/me/events');
    const ev = await loadOwnEvent(eventId, profile.profileId);
    if (!ev) return { ok: false, error: 'Event not found.' };

    const plan = stops.map((s, i) => {
        const entry: Record<string, unknown> = {
            seq: (i + 1) * 100,
            kind: s.kind,
            name: s.name.trim(),
            lat: s.lat,
            lng: s.lng,
        };
        if (s.etaLocal && s.etaLocal.trim()) entry.eta_local = s.etaLocal.trim();
        if (s.dwellMin != null && Number.isFinite(s.dwellMin)) entry.dwell_min = s.dwellMin;
        if (s.note && s.note.trim()) entry.note = s.note.trim();
        return entry;
    });

    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('set_event_route_plan', {
        p_event: eventId,
        p_plan: plan.length > 0 ? plan : null,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/me/events/${eventId}`);
    revalidatePath(`/event/${eventId}`);
    return { ok: true, count: (data as number | null) ?? 0 };
}

export async function cancelHostEvent(eventId: string, cancel: boolean) {
    const profile = await requireVerifiedHost('/me/events');

    // 077: a paid event can never be cancelled without refunding its ticket
    // holders. Individual-host events (/me/events) do not expose paid tiers
    // in today's UI, so this should be unreachable in practice — kept as a
    // hard guard rather than trusting that to stay true. Use "Cancel event &
    // refund everyone" instead, which cancels AND refunds atomically.
    if (cancel) {
        const paid = await eventHasPaidExposure(eventId);
        if (paid) {
            throw new Error(
                'This event has paid tickets — use "Cancel event & refund everyone" so ticket holders are refunded.',
            );
        }
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: cancel ? new Date().toISOString() : null })
        .eq('id', eventId)
        .eq('host_id', profile.profileId)
        .is('shop_id', null);
    // Not form-input driven — `cancel` is a fixed boolean toggle, so a
    // failure here is a genuine DB/infra error, not something a validation
    // message would help with. Left as a throw (see actions.ts audit notes).
    if (error) throw new Error(error.message);
    revalidatePath('/me/events');
    revalidatePath(`/me/events/${eventId}`);
    revalidatePath('/meets');
}

// ── Host invitations ─────────────────────────────────────────────────────

export type HostInviteResult =
    | { ok: false; error: string }
    | {
          ok: true;
          sent: number;
          failed: number;
          invalid: string[];
          results: { email: string; status: 'sent' | 'failed'; reason?: string }[];
      };

/** Neutral Rollout branding fed to the shop-oriented invite renderer. */
function rolloutBranding(hostName: string, hostHandle: string): InviteBranding {
    return {
        shopName: 'Rollout',
        fromName: hostName,
        logoUrl: null,
        primaryColor: '#e8a845',
        secondaryColor: '#e8a845',
        supportEmail: null,
        pageHandle: hostHandle,
    };
}

function toInviteEvent(ev: any): InviteEvent {
    return {
        id: ev.id,
        title: ev.title,
        typeLabel: TYPE_LABEL[ev.type] ?? String(ev.type ?? 'EVENT').replace(/_/g, ' '),
        startAtISO: ev.start_at,
        locationName: ev.location_name ?? '',
        locationDetail: ev.location_detail ?? null,
        code: ev.code ?? null,
        description: ev.description ?? null,
    };
}

function parseRecipients(raw: string): { emails: string[]; invalid: string[] } {
    const tokens = raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
    const seen = new Set<string>();
    const emails: string[] = [];
    const invalid: string[] = [];
    for (const t of tokens) {
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (EMAIL_RE.test(t)) emails.push(t);
        else invalid.push(t);
    }
    return { emails, invalid };
}

export async function sendHostInvites(
    eventId: string,
    formData: FormData,
): Promise<HostInviteResult> {
    const profile = await requireVerifiedHost('/me/events');
    const ev = await loadOwnEvent(eventId, profile.profileId);
    if (!ev) return { ok: false, error: 'Event not found.' };
    if (ev.cancelled_at) return { ok: false, error: 'This event is cancelled.' };

    const styleRaw = String(formData.get('template_key') ?? 'hud').trim() as InviteStyleKey;
    const style: InviteStyleKey = VALID_STYLES.has(styleRaw) ? styleRaw : 'hud';
    const personalNote = String(formData.get('personal_note') ?? '').trim() || null;
    const invitedName = String(formData.get('invited_name') ?? '').trim() || null;
    const { emails, invalid } = parseRecipients(String(formData.get('recipients') ?? ''));

    if (emails.length === 0) {
        return { ok: false, error: invalid.length ? 'No valid email addresses found.' : 'Enter at least one recipient.' };
    }
    if (emails.length > MAX_RECIPIENTS) {
        return { ok: false, error: `Too many recipients (max ${MAX_RECIPIENTS} per send).` };
    }

    const branding = rolloutBranding(profile.displayName || profile.handle, profile.handle);
    const inviteEvent = toInviteEvent(ev);
    const results: { email: string; status: 'sent' | 'failed'; reason?: string }[] = [];

    for (const email of emails) {
        // No shop-scoped event_invites row (host events have no shop). RSVP still
        // works via the event page; a fresh random token seeds the ?invite link.
        const token = crypto.randomUUID();
        const { subject, html } = renderInvite({
            style,
            branding,
            event: inviteEvent,
            invitedName,
            personalNote,
            hostNames: [profile.displayName || profile.handle],
            token,
        });
        const res = await sendPlatformNotification({
            template: 'platform_host_invite',
            to: email,
            subjectOverride: subject,
            vars: { html, subject },
            linkedEventId: eventId,
        });
        if (res.ok) results.push({ email, status: 'sent' });
        else results.push({ email, status: 'failed', reason: res.error ?? res.skipped ?? 'send failed' });
    }

    revalidatePath(`/me/events/${eventId}`);
    return {
        ok: true,
        sent: results.filter((r) => r.status === 'sent').length,
        failed: results.filter((r) => r.status === 'failed').length,
        invalid,
        results,
    };
}
