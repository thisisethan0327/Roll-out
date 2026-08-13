'use server';
/**
 * Event invitations + co-hosts — server actions for the shop event detail page.
 *
 * Send path (established pattern): web renders the fully-branded, multi-style
 * HTML via the isomorphic template module (src/lib/event-invites) so the
 * dashboard preview is byte-identical to the email, then dispatches through the
 * send-shop-notification Edge Function (branded From/Reply-To via
 * shop_email_branding, opt-out gate, email_log audit). Web owns the
 * rollout.event_invites + rollout.event_cohosts rows.
 *
 * Authorization: every action re-checks the caller is a manager of the shop it
 * claims to act for. Attendee invites additionally require the acting shop to
 * be the event's host OR an accepted co-host.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
    renderInvite,
    renderCoHostInvite,
    type InviteBranding,
    type InviteEvent,
    type InviteStyleKey,
} from '@/lib/event-invites';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STYLES = new Set<InviteStyleKey>(['hud', 'minimal', 'poster', 'classic']);
const MAX_RECIPIENTS = 100;

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'NIGHT RUN',
    CAR_MEET: 'CAR MEET',
    TRACK_DAY: 'TRACK DAY',
    CRUISE: 'CRUISE',
    SHOW: 'SHOW',
};

async function requireManager(shopId: number) {
    const { profile, role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) throw new Error('Manager role required.');
    return { profile, role };
}

async function loadEventRow(eventId: string) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select(
            'id, shop_id, host_id, code, type, title, description, location_name, location_detail, start_at, cancelled_at',
        )
        .eq('id', eventId)
        .maybeSingle();
    return data as any;
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

async function loadBranding(shopId: number): Promise<InviteBranding | null> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.rpc('shop_email_branding', { p_shop_id: shopId });
    const b = (data as any[])?.[0];
    if (!b) return null;
    return {
        shopName: b.name,
        fromName: b.from_name ?? b.name,
        logoUrl: b.email_logo_url ?? null,
        primaryColor: b.primary_color ?? '#e8a845',
        secondaryColor: b.secondary_color ?? b.primary_color ?? '#e8a845',
        supportEmail: b.support_email ?? null,
        pageHandle: b.page_handle ?? null,
    };
}

/** Host shop name first, then accepted co-host shop names in invite order. */
async function loadHostNames(eventId: string, hostShopId: number): Promise<string[]> {
    const admin = getSupabaseAdmin();
    const [{ data: host }, { data: cohosts }] = await Promise.all([
        admin.from('shops').select('name, from_name').eq('id', hostShopId).maybeSingle(),
        admin
            .from('event_cohosts')
            .select('invited_at, shop:shops!event_cohosts_shop_id_fkey(name, from_name)')
            .eq('event_id', eventId)
            .eq('status', 'accepted')
            .order('invited_at', { ascending: true }),
    ]);
    const names: string[] = [];
    if (host) names.push((host as any).from_name ?? (host as any).name);
    for (const c of (cohosts as any[]) ?? []) {
        const s = c.shop;
        if (s) names.push(s.from_name ?? s.name);
    }
    return names.filter(Boolean);
}

/** True when `shopId` may send attendee invites for this event. */
async function shopCanInvite(eventId: string, eventHostShopId: number, shopId: number): Promise<boolean> {
    if (eventHostShopId === shopId) return true;
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('event_cohosts')
        .select('status')
        .eq('event_id', eventId)
        .eq('shop_id', shopId)
        .maybeSingle();
    return (data as any)?.status === 'accepted';
}

function parseRecipients(raw: string): { emails: string[]; invalid: string[] } {
    const tokens = raw
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
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

export type InviteSendResult =
    | { ok: false; error: string }
    | {
          ok: true;
          sent: number;
          skipped: number;
          failed: number;
          invalid: string[];
          results: { email: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }[];
      };

/**
 * Send attendee invitations for one event under `shopId` (host or accepted
 * co-host). Renders each recipient's email with the chosen style + a per-invite
 * token, records/updates the event_invites row, and dispatches via the Edge
 * Function. Opt-outs are honored; sends are capped at MAX_RECIPIENTS.
 */
export async function sendEventInvites(
    eventId: string,
    shopId: number,
    formData: FormData,
): Promise<InviteSendResult> {
    const { profile } = await requireManager(shopId);
    const admin = getSupabaseAdmin();

    const ev = await loadEventRow(eventId);
    if (!ev) return { ok: false, error: 'Event not found.' };
    if (ev.cancelled_at) return { ok: false, error: 'This event is cancelled.' };
    if (!(await shopCanInvite(eventId, ev.shop_id, shopId))) {
        return { ok: false, error: 'This shop is not a host or accepted co-host of this event.' };
    }

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

    const branding = await loadBranding(shopId);
    if (!branding) return { ok: false, error: 'Shop branding not found.' };
    const hostNames = await loadHostNames(eventId, ev.shop_id);
    const inviteEvent = toInviteEvent(ev);

    const results: { email: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }[] = [];

    for (const email of emails) {
        // Honor opt-outs (marketing/all) for members who opted out of this shop.
        const { data: optedOut } = await admin.rpc('email_opted_out', {
            p_shop_id: shopId,
            p_email: email,
        });
        if (optedOut === true) {
            results.push({ email, status: 'skipped', reason: 'opted out' });
            continue;
        }

        // Upsert the invite row (manual — the unique index is on lower(email)).
        let inviteId: string | null = null;
        let token: string | null = null;
        const { data: existing } = await admin
            .from('event_invites')
            .select('id, token')
            .eq('event_id', eventId)
            .ilike('invited_email', email)
            .maybeSingle();

        if (existing) {
            inviteId = (existing as any).id;
            token = (existing as any).token;
            await admin
                .from('event_invites')
                .update({
                    shop_id: shopId,
                    invited_name: invitedName,
                    personal_note: personalNote,
                    template_key: style,
                })
                .eq('id', inviteId);
        } else {
            const { data: inserted, error: insErr } = await admin
                .from('event_invites')
                .insert({
                    event_id: eventId,
                    shop_id: shopId,
                    invited_email: email,
                    invited_name: invitedName,
                    personal_note: personalNote,
                    template_key: style,
                })
                .select('id, token')
                .single();
            if (insErr || !inserted) {
                results.push({ email, status: 'failed', reason: 'db insert failed' });
                continue;
            }
            inviteId = (inserted as any).id;
            token = (inserted as any).token;
        }

        const { subject, html } = renderInvite({
            style,
            branding,
            event: inviteEvent,
            invitedName,
            personalNote,
            hostNames,
            token: token!,
        });

        const { data: sendResp, error: sendErr } = await admin.functions.invoke(
            'send-shop-notification',
            {
                body: {
                    shop_id: shopId,
                    template: 'event_invite',
                    to: email,
                    subject_override: subject,
                    vars: { html, subject },
                    linked_event_id: eventId,
                },
            },
        );

        const respErr = (sendResp as any)?.error;
        if (sendErr || respErr) {
            results.push({ email, status: 'failed', reason: respErr ?? sendErr?.message ?? 'send failed' });
            continue;
        }
        if ((sendResp as any)?.skipped) {
            results.push({ email, status: 'skipped', reason: String((sendResp as any).skipped) });
            continue;
        }

        await admin
            .from('event_invites')
            .update({ sent_at: new Date().toISOString(), sent_by: profile.profileId })
            .eq('id', inviteId!);
        results.push({ email, status: 'sent' });
    }

    const slug = await fetchSlug(shopId);
    if (slug) revalidatePath(`/shop/${slug}/events/${eventId}`, 'page');

    return {
        ok: true,
        sent: results.filter((r) => r.status === 'sent').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        failed: results.filter((r) => r.status === 'failed').length,
        invalid,
        results,
    };
}

// ── Co-hosts ───────────────────────────────────────────────────────────

async function fetchSlug(shopId: number): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('shops').select('slug').eq('id', shopId).maybeSingle();
    return (data as any)?.slug ?? '';
}

export type CoHostCandidate = { id: number; name: string; slug: string };

/** Directory search for shops the host can invite to co-host (excludes host +
 *  shops already on the event). */
export async function searchCoHostCandidates(
    hostShopId: number,
    eventId: string,
    query: string,
): Promise<CoHostCandidate[]> {
    await requireManager(hostShopId);
    const admin = getSupabaseAdmin();
    const q = query.trim();

    const { data: existing, error: existingError } = await admin
        .from('event_cohosts')
        .select('shop_id')
        .eq('event_id', eventId);
    if (existingError)
        console.error('[shop/events/[id]/invite-actions] existing co-hosts load failed:', existingError.message);
    const excluded = new Set<number>([hostShopId, ...((existing as any[]) ?? []).map((r) => r.shop_id)]);

    let sel = admin.from('shops').select('id, name, slug').order('name').limit(8);
    if (q) sel = sel.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
    const { data, error } = await sel;
    if (error)
        console.error('[shop/events/[id]/invite-actions] candidate search failed:', error.message);
    return ((data as any[]) ?? [])
        .filter((s) => !excluded.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, slug: s.slug }));
}

export async function inviteCoHost(eventId: string, hostShopId: number, coHostShopId: number) {
    const { profile } = await requireManager(hostShopId);
    const admin = getSupabaseAdmin();

    const ev = await loadEventRow(eventId);
    if (!ev) throw new Error('Event not found.');
    if (ev.shop_id !== hostShopId) throw new Error('Only the host shop can add co-hosts.');
    if (coHostShopId === hostShopId) throw new Error('A shop cannot co-host its own event.');

    const { error } = await admin.from('event_cohosts').upsert(
        {
            event_id: eventId,
            shop_id: coHostShopId,
            status: 'invited',
            invited_by: profile.profileId,
            invited_at: new Date().toISOString(),
            responded_at: null,
        },
        { onConflict: 'event_id,shop_id' },
    );
    if (error) throw new Error(error.message);

    // Notify the co-host shop (best-effort — never blocks the invite).
    try {
        const hostBranding = await loadBranding(hostShopId);
        const coBranding = await loadBranding(coHostShopId);
        const coSlug = await fetchSlug(coHostShopId);
        const recipient = coBranding?.supportEmail;
        if (hostBranding && coBranding && recipient) {
            const { subject, html } = renderCoHostInvite({
                hostBranding,
                coHostName: coBranding.fromName,
                event: toInviteEvent(ev),
                manageUrl: `https://rollout.club/shop/${coSlug}/events`,
            });
            await admin.functions.invoke('send-shop-notification', {
                body: {
                    shop_id: hostShopId,
                    template: 'event_invite',
                    to: recipient,
                    subject_override: subject,
                    vars: { html, subject },
                    linked_event_id: eventId,
                },
            });
        }
    } catch {
        // swallow — the co-host row exists regardless; they'll see it in-app.
    }

    const slug = await fetchSlug(hostShopId);
    if (slug) revalidatePath(`/shop/${slug}/events/${eventId}`, 'page');
}

export async function respondCoHost(eventId: string, coHostShopId: number, accept: boolean) {
    await requireManager(coHostShopId);
    const admin = getSupabaseAdmin();

    const { data: row } = await admin
        .from('event_cohosts')
        .select('event_id')
        .eq('event_id', eventId)
        .eq('shop_id', coHostShopId)
        .maybeSingle();
    if (!row) throw new Error('Co-host invitation not found.');

    const { error } = await admin
        .from('event_cohosts')
        .update({
            status: accept ? 'accepted' : 'declined',
            responded_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('shop_id', coHostShopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(coHostShopId);
    if (slug) {
        revalidatePath(`/shop/${slug}/events`, 'page');
        revalidatePath(`/shop/${slug}/events/${eventId}`, 'page');
    }
}

export async function removeCoHost(eventId: string, hostShopId: number, coHostShopId: number) {
    await requireManager(hostShopId);
    const admin = getSupabaseAdmin();

    const ev = await loadEventRow(eventId);
    if (!ev) throw new Error('Event not found.');
    if (ev.shop_id !== hostShopId) throw new Error('Only the host shop can remove co-hosts.');

    const { error } = await admin
        .from('event_cohosts')
        .delete()
        .eq('event_id', eventId)
        .eq('shop_id', coHostShopId);
    if (error) throw new Error(error.message);

    const slug = await fetchSlug(hostShopId);
    if (slug) revalidatePath(`/shop/${slug}/events/${eventId}`, 'page');
}
