'use server';
/**
 * Member RSVP actions for /event/[id].
 *
 * E0 (atomic capacity hold): the going-RSVP write now flows through the
 * rollout.reserve_spot() RPC — the ONE atomic path shared by web + mobile. It
 * locks per-event, counts real occupancy, and either CONFIRMS (assigning a
 * sequential spot number) or WAITLISTS. This replaces the old non-atomic
 * read-then-write cap check (which raced at the cap edge). Clearing an RSVP goes
 * through rollout.cancel_rsvp(), which frees the spot AND promotes the oldest
 * waitlisted member. Soft states (maybe / declined) release any held spot first
 * (so the waitlist promotes) then record the soft choice.
 *
 * E2/E3 (event tiers): reserve_spot now takes an optional p_tier. Free events
 * ignore it (zero regression). For 'tiered'/'paid' events a tier is REQUIRED:
 * a free tier (price_cents=0) confirms exactly like today, a paid tier returns
 * state='held' + hold_expires_at (~15 min TTL) — the spot is reserved pending
 * payment through the event-package checkout (startPackageCheckout below).
 *
 * Writes flow through the anon SSR client (getRolloutMemberClient); the RPCs are
 * SECURITY DEFINER and resolve the caller via current_profile_id() (self-only).
 * attending_count stays trigger-maintained, so we only revalidate and re-render.
 */
import { revalidatePath } from 'next/cache';
import { getConsumerProfile, getRolloutMemberClient } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createEventPackageCart } from '@/lib/event-cart';

export type RsvpChoice = 'going' | 'maybe' | 'declined';
/** The member's resolved RSVP state after a write (or as loaded for the page). */
export type RsvpState = 'confirmed' | 'held' | 'waitlisted' | 'maybe' | 'declined' | null;
export type RsvpError = 'auth' | 'full' | 'closed' | 'invalid' | 'tier' | 'write';
export type RsvpResult =
    | {
          ok: true;
          state: RsvpState;
          spotNo?: number | null;
          waitlistPosition?: number | null;
          /** ISO timestamp the paid-tier hold expires at (state === 'held'). */
          holdExpiresAt?: string | null;
      }
    | { ok: false; error: RsvpError };

export type PackageCheckoutResult =
    | { ok: true; redirect: string }
    | { ok: true; state: 'waitlisted'; waitlistPosition: number | null }
    | { ok: false; error: RsvpError | 'config' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID: RsvpChoice[] = ['going', 'maybe', 'declined'];
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set (or clear, when status === null) the caller's RSVP for an event.
 * Returns a discriminated result the client turns into UI state — it never
 * throws for the expected cases (not signed in, full/closed, waitlisted).
 * `tierId` targets a specific tier on tiered/paid events (free events ignore
 * it inside reserve_spot).
 */
export async function setRsvp(
    eventId: string,
    status: RsvpChoice | null,
    inviteToken?: string | null,
    tierId?: string | null,
): Promise<RsvpResult> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'invalid' };
    if (status !== null && !VALID.includes(status)) return { ok: false, error: 'invalid' };
    if (tierId != null && !UUID_RE.test(tierId)) return { ok: false, error: 'tier' };

    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'auth' };

    // Load the event with the service-role client to validate state (past /
    // cancelled / non-public) up front for every path. reserve_spot re-checks
    // this atomically; the pre-check keeps the soft/clear paths consistent.
    const admin = getSupabaseAdmin();
    const { data: ev } = await admin
        .from('events')
        .select('id, visibility, cancelled_at, start_at')
        .eq('id', eventId)
        .maybeSingle();

    if (!ev || (ev as any).visibility !== 'public') return { ok: false, error: 'invalid' };
    if ((ev as any).cancelled_at) return { ok: false, error: 'closed' };
    if ((ev as any).start_at && new Date((ev as any).start_at).getTime() < Date.now()) {
        return { ok: false, error: 'closed' };
    }

    const member = await getRolloutMemberClient();

    // ── Clearing the RSVP → cancel_rsvp (frees the spot + promotes waitlist). ──
    if (status === null) {
        const { error } = await member.rpc('cancel_rsvp', { p_event: eventId });
        if (error) return { ok: false, error: 'write' };
        revalidatePath(`/event/${eventId}`);
        return { ok: true, state: null };
    }

    // ── Going → the atomic reserve_spot RPC (confirm, hold, or waitlist). ──
    if (status === 'going') {
        const { data, error } = await member.rpc('reserve_spot', {
            p_event: eventId,
            p_tier: tierId ?? null,
        });
        if (error) return { ok: false, error: 'write' };
        const state = (data as any)?.state as string | undefined;
        if (state === 'auth') return { ok: false, error: 'auth' };
        if (state === 'closed' || state === 'not_found') return { ok: false, error: 'closed' };
        if (state === 'tier_required' || state === 'invalid_tier') {
            return { ok: false, error: 'tier' };
        }

        // Invite attribution (best-effort) — mirrors the pre-E0 behavior.
        await attributeInvite(admin, inviteToken, eventId, me.profileId, 'going');
        revalidatePath(`/event/${eventId}`);

        if (state === 'confirmed') {
            return { ok: true, state: 'confirmed', spotNo: (data as any)?.spot_no ?? null };
        }
        if (state === 'held') {
            return {
                ok: true,
                state: 'held',
                spotNo: (data as any)?.spot_no ?? null,
                holdExpiresAt: (data as any)?.hold_expires_at ?? null,
            };
        }
        if (state === 'waitlisted') {
            return { ok: true, state: 'waitlisted', waitlistPosition: (data as any)?.waitlist_position ?? null };
        }
        return { ok: false, error: 'write' };
    }

    // ── Soft states (maybe / declined). Release any held spot first so the
    //    waitlist promotes, then record the soft choice directly (RLS-gated). ──
    await member.rpc('cancel_rsvp', { p_event: eventId });
    const { error } = await member
        .from('event_rsvps')
        .upsert(
            { event_id: eventId, profile_id: me.profileId, status },
            { onConflict: 'event_id,profile_id' },
        );
    if (error) return { ok: false, error: 'write' };

    await attributeInvite(admin, inviteToken, eventId, me.profileId, status);
    revalidatePath(`/event/${eventId}`);
    return { ok: true, state: status };
}

/**
 * Paid-tier flow (E3): reserve the spot (state='held', ~15 min TTL), then
 * create the one-package Medusa cart on the walled Events channel and send the
 * member to /event/[id]/checkout. A 'confirmed' reserve result also proceeds —
 * that's the retry case (the member already holds this spot and is re-entering
 * checkout). The tier is validated server-side against the event with the
 * service-role client BEFORE any reservation is attempted.
 */
export async function startPackageCheckout(
    eventId: string,
    tierId: string,
): Promise<PackageCheckoutResult> {
    if (!UUID_RE.test(eventId) || !UUID_RE.test(tierId)) return { ok: false, error: 'invalid' };

    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'auth' };

    // Validate the tier belongs to this event, is active, and is purchasable.
    const admin = getSupabaseAdmin();
    const { data: tier, error: tierError } = await admin
        .from('event_tiers')
        .select('id, event_id, active, price_cents, medusa_product_id')
        .eq('id', tierId)
        .maybeSingle();
    if (tierError) console.error('[event/[id]] startPackageCheckout tier load failed:', tierError.message);
    if (!tier || (tier as any).event_id !== eventId || !(tier as any).active) {
        return { ok: false, error: 'tier' };
    }
    const medusaProductId = (tier as any).medusa_product_id as string | null;
    if (!medusaProductId) return { ok: false, error: 'tier' };

    // Reserve atomically — reserve_spot re-validates event state (closed /
    // cancelled / full) so no separate pre-check is needed here.
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('reserve_spot', {
        p_event: eventId,
        p_tier: tierId,
    });
    if (error) return { ok: false, error: 'write' };
    const state = (data as any)?.state as string | undefined;

    if (state === 'auth') return { ok: false, error: 'auth' };
    if (state === 'closed' || state === 'not_found') return { ok: false, error: 'closed' };
    if (state === 'tier_required' || state === 'invalid_tier') return { ok: false, error: 'tier' };
    if (state === 'waitlisted') {
        revalidatePath(`/event/${eventId}`);
        return {
            ok: true,
            state: 'waitlisted',
            waitlistPosition: (data as any)?.waitlist_position ?? null,
        };
    }
    if (state !== 'held' && state !== 'confirmed') return { ok: false, error: 'write' };

    const cart = await createEventPackageCart({
        eventId,
        tierId,
        profileId: me.profileId,
        medusaProductId,
    });
    if (!cart.ok) {
        // The hold stands (it expires on its own TTL) — surface a config-ish
        // failure so the member can retry without losing their place.
        console.error('[event/[id]] event cart creation failed:', cart.error);
        return { ok: false, error: 'config' };
    }

    revalidatePath(`/event/${eventId}`);
    return { ok: true, redirect: `/event/${eventId}/checkout` };
}

/**
 * Lightweight self-RSVP snapshot for the post-payment confirmation poll: the
 * backend's order.placed subscriber flips held → confirmed asynchronously, so
 * the checkout confirmation re-reads until the flip lands.
 */
export async function getRsvpSnapshot(
    eventId: string,
): Promise<{ state: RsvpState; spotNo: number | null }> {
    if (!UUID_RE.test(eventId)) return { state: null, spotNo: null };
    const me = await getConsumerProfile();
    if (!me) return { state: null, spotNo: null };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_rsvps')
        .select('status, hold_state, spot_no')
        .eq('event_id', eventId)
        .eq('profile_id', me.profileId)
        .maybeSingle();
    if (error) {
        console.error('[event/[id]] getRsvpSnapshot failed:', error.message);
        return { state: null, spotNo: null };
    }
    const status = (data as any)?.status as string | undefined;
    const hold = (data as any)?.hold_state as string | undefined;
    if (status === 'going' && hold === 'confirmed') {
        return { state: 'confirmed', spotNo: (data as any)?.spot_no ?? null };
    }
    if (status === 'going' && hold === 'held') {
        return { state: 'held', spotNo: (data as any)?.spot_no ?? null };
    }
    if (hold === 'waitlisted') return { state: 'waitlisted', spotNo: null };
    return { state: null, spotNo: null };
}

/**
 * Best-effort invite attribution: if the member arrived via ?invite=<token>,
 * stamp the matching event_invite's rsvp_status. The DB function verifies the
 * token belongs to this event AND was addressed to this member's email, so a
 * shared link can't misattribute. Never fails the RSVP.
 */
async function attributeInvite(
    admin: ReturnType<typeof getSupabaseAdmin>,
    inviteToken: string | null | undefined,
    eventId: string,
    profileId: string,
    status: RsvpChoice,
): Promise<void> {
    if (!inviteToken || !TOKEN_RE.test(inviteToken)) return;
    try {
        await admin.rpc('event_invite_attribute_rsvp', {
            p_token: inviteToken,
            p_event_id: eventId,
            p_profile_id: profileId,
            p_status: status,
        });
    } catch {
        // ignore — attribution is non-critical
    }
}
