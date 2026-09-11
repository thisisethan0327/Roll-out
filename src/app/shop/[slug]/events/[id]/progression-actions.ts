'use server';
/**
 * Event verification + door check-in — server actions for the shop event page.
 *
 * Every write goes through a 066/067 SECURITY DEFINER RPC called AS THE USER
 * (getSupabaseServer → the RPC checks host / shop-manager itself); the shop
 * membership guard here is defense-in-depth and keeps the acting shop honest.
 * The coin artwork is the one thing web stores directly: rollout-media/
 * events/<id>/coin.png, 1024², resized here so the admin never sees a
 * 40 MB scan.
 */
import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CHECK_RULES, RULES_VERSION, type RuleId } from '@/lib/verification-rules';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const MEDIA_BUCKET = 'rollout-media';
const MAX_BYTES = 8 * 1024 * 1024;

type Result = { ok: true } | { ok: false; error: string };

type Guard = { error: string; path?: undefined } | { error?: undefined; path: string };

async function guard(shopId: number, eventId: string, slug: string): Promise<Guard> {
    const { role } = await requireShopMember(shopId);
    if (!MANAGER_ROLES.has(role)) return { error: 'Only shop managers can do that.' };
    const admin = getSupabaseAdmin();
    const { data: ev } = await admin.from('events').select('id, shop_id, cancelled_at').eq('id', eventId).maybeSingle();
    if (!ev || (ev as any).shop_id !== shopId) return { error: 'That event is not hosted by this shop.' };
    if ((ev as any).cancelled_at) return { error: 'This event is cancelled.' };
    return { path: `/shop/${slug}/events/${eventId}` };
}

function friendly(message: string): string {
    if (/needs a venue|capacity/i.test(message)) return 'Set a venue (or route) and a capacity on the event first.';
    if (/not the host/i.test(message)) return 'Only the host or a shop manager can do that.';
    if (/no RSVP/i.test(message)) return 'That member has not RSVP’d "going".';
    if (/does not check in/i.test(message)) return 'The host does not check in.';
    return message;
}

/** The six attestations + the coin PNG → request_event_verification. */
export async function requestVerificationAction(formData: FormData): Promise<Result> {
    const shopId = Number(formData.get('shopId'));
    const eventId = String(formData.get('eventId') ?? '');
    const slug = String(formData.get('slug') ?? '');
    const g = await guard(shopId, eventId, slug);
    if (g.error !== undefined) return { ok: false, error: g.error };

    const attestations: Partial<Record<RuleId, unknown>> = {};
    for (const r of CHECK_RULES) {
        if (formData.get(r.id) !== 'on') return { ok: false, error: `Confirm "${r.title}" to continue.` };
        attestations[r.id] = true;
    }

    const file = formData.get('artwork');
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Add the coin artwork (1024 × 1024 PNG).' };
    if (file.size > MAX_BYTES) return { ok: false, error: 'That PNG is over 8 MB.' };
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return { ok: false, error: 'Use a PNG (JPG or WebP is converted).' };
    let out: Buffer;
    try {
        out = await sharp(Buffer.from(await file.arrayBuffer()))
            .rotate()
            .resize(1024, 1024, { fit: 'cover', position: 'attention' })
            .png()
            .toBuffer();
    } catch {
        return { ok: false, error: 'That file could not be read as an image.' };
    }
    const admin = getSupabaseAdmin();
    const path = `events/${eventId}/coin.png`;
    const { error: upErr } = await admin.storage.from(MEDIA_BUCKET).upload(path, out, { contentType: 'image/png', upsert: true });
    if (upErr) return { ok: false, error: `Artwork upload failed: ${upErr.message}` };
    const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    attestations.artwork_url = `${pub.publicUrl}?v=${Date.now()}`;

    const supabase = await getSupabaseServer();
    const { error } = await supabase.schema('rollout').rpc('request_event_verification', {
        p_event: eventId,
        p_attestations: attestations,
        p_rules_version: RULES_VERSION,
    });
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath(g.path);
    return { ok: true };
}

/** New door code; the QR on the page carries it. */
export async function rotateCheckinCodeAction(input: { shopId: number; eventId: string; slug: string }): Promise<Result & { code?: string }> {
    const g = await guard(input.shopId, input.eventId, input.slug);
    if (g.error !== undefined) return { ok: false, error: g.error };
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.schema('rollout').rpc('rotate_checkin_code', { p_event: input.eventId });
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath(g.path);
    return { ok: true, code: String(data ?? '') };
}

/** Host checks a "going" member in at the door (067 host_check_in). */
export async function hostCheckInAction(input: { shopId: number; eventId: string; slug: string; profileId: string }): Promise<Result & { serial?: number | null; xp?: number }> {
    const g = await guard(input.shopId, input.eventId, input.slug);
    if (g.error !== undefined) return { ok: false, error: g.error };
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.schema('rollout').rpc('host_check_in', { p_event: input.eventId, p_profile: input.profileId });
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath(g.path);
    const r = (data ?? {}) as { already?: boolean; coin_serial?: number | null; xp?: number };
    if (r.already) return { ok: false, error: 'Already checked in.' };
    return { ok: true, serial: r.coin_serial ?? null, xp: r.xp ?? 0 };
}
