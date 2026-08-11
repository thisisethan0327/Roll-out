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
import { redirect } from 'next/navigation';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendPlatformNotification } from '@/lib/platform-notify';
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

function parseHeroUrl(raw: FormDataEntryValue | null): string | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) throw new Error('Cover URL must be an http(s) link.');
    if (s.length > 1000) throw new Error('Cover URL is too long.');
    return s;
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

export async function createHostEvent(formData: FormData) {
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
    const hero_image_url = parseHeroUrl(formData.get('hero_image_url'));

    if (!ALLOWED_TYPES.has(type)) throw new Error('Invalid event type.');
    if (title.length < 4) throw new Error('Title must be at least 4 characters.');
    if (description.length > 400) throw new Error('Description must be 400 chars or fewer.');
    if (location_name.length < 2) throw new Error('Location name is required.');
    if (!start_at_raw) throw new Error('Start time is required.');
    if (!ALLOWED_VIS.has(visibility)) throw new Error('Invalid visibility.');
    const start_at = new Date(start_at_raw);
    if (isNaN(start_at.getTime())) throw new Error('Invalid start time.');

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
            is_official: false,
            attending_count: 0,
        })
        .select('id')
        .single();
    if (error) throw new Error(error.message);

    const newId = (data as any).id as string;
    revalidatePath('/me/events');
    revalidatePath('/meets');
    redirect(`/me/events/${newId}?just_created=1`);
}

export async function updateHostEvent(eventId: string, formData: FormData) {
    const profile = await requireVerifiedHost('/me/events');
    const ev = await loadOwnEvent(eventId, profile.profileId);
    if (!ev) throw new Error('Event not found.');

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
    const hero_image_url = parseHeroUrl(formData.get('hero_image_url'));

    if (title.length < 4) throw new Error('Title must be at least 4 characters.');
    if (description.length > 400) throw new Error('Description must be 400 chars or fewer.');
    if (location_name.length < 2) throw new Error('Location name is required.');
    if (!start_at_raw) throw new Error('Start time is required.');
    if (!ALLOWED_VIS.has(visibility)) throw new Error('Invalid visibility.');
    const start_at = new Date(start_at_raw);
    if (isNaN(start_at.getTime())) throw new Error('Invalid start time.');

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
            updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('host_id', profile.profileId)
        .is('shop_id', null);
    if (error) throw new Error(error.message);

    revalidatePath('/me/events');
    revalidatePath(`/me/events/${eventId}`);
    revalidatePath('/meets');
}

export async function cancelHostEvent(eventId: string, cancel: boolean) {
    const profile = await requireVerifiedHost('/me/events');
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: cancel ? new Date().toISOString() : null })
        .eq('id', eventId)
        .eq('host_id', profile.profileId)
        .is('shop_id', null);
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
