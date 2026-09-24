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
import { createEventPackageCart, createEventTicketsCart } from '@/lib/event-cart';
import { cancelPaidRsvpAndRefund, getRefundWindowOpen } from '@/lib/event-refund';
import {
    multiTicketsEnabled,
    reserveTickets,
    MAX_TICKETS_PER_ORDER,
    type TicketAttendeeInput,
} from '@/lib/event-tickets';

export type RsvpChoice = 'going' | 'maybe' | 'declined';

/**
 * What an invite row RECORDS, which is not what a member can PICK. Nobody
 * chooses the waitlist — reserve_spot puts them there when the event is full —
 * but it is the outcome the host needs to see, so the recorded set is wider
 * than RsvpChoice by exactly that one value. It matches rollout.rsvp_status.
 */
export type InviteRsvpStatus = RsvpChoice | 'waitlist';
/**
 * The member's resolved RSVP state after a write (or as loaded for the page).
 * 'ticket_pending' (migration 080, reserve_spot's new outcome): the caller
 * has a ticket on someone ELSE's multi-ticket order that's still HELD (the
 * buyer hasn't paid yet) — reserve_spot can't confirm anything for them
 * until that resolves, so their own reserve attempt just reports the wait.
 */
export type RsvpState = 'confirmed' | 'held' | 'waitlisted' | 'maybe' | 'declined' | 'ticket_pending' | null;
export type RsvpError = 'auth' | 'full' | 'closed' | 'invalid' | 'tier' | 'write' | 'paid_spot';
export type RsvpResult =
    | {
          ok: true;
          state: RsvpState;
          spotNo?: number | null;
          waitlistPosition?: number | null;
          /** ISO timestamp the paid-tier hold expires at (state === 'held'). */
          holdExpiresAt?: string | null;
          /** Set when reserve_spot's 'confirmed' outcome came from CLAIMING a
           *  ticket bought for the caller's email on someone else's order
           *  (migration 080), rather than a fresh reservation. */
          ticketId?: string | null;
      }
    | { ok: false; error: RsvpError };

export type PackageCheckoutResult =
    | { ok: true; redirect: string }
    | { ok: true; state: 'waitlisted'; waitlistPosition: number | null }
    // Migration 080: reserve_spot claimed a ticket already bought for the
    // caller's email — they're in, no payment needed from them.
    | { ok: true; state: 'confirmed'; spotNo: number | null }
    // Migration 080: the caller has a ticket on someone else's order that's
    // still held (unpaid) — nothing to reserve/pay for on their own yet.
    | { ok: true; state: 'ticket_pending' }
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
        if (error) {
            // 077: a confirmed PAID spot raises P0001 'paid_spot: …' instead of
            // releasing — the UI should never reach this for a paid tier (it
            // shows the Cancel & refund control instead of this plain cancel),
            // but a race or another caller could still land here.
            if (/paid_spot/i.test(error.message)) return { ok: false, error: 'paid_spot' };
            return { ok: false, error: 'write' };
        }
        await refreshAttributedInvite(admin, eventId, me.profileId, null);
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

        // Record the RESOLVED outcome, not the request. reserve_spot may have
        // waitlisted this member, and an invite row claiming 'going' tells the
        // host their invitation landed a spot that it did not.
        const resolved: InviteRsvpStatus = state === 'waitlisted' ? 'waitlist' : 'going';
        await attributeInvite(admin, inviteToken, eventId, me.profileId, resolved);
        await refreshAttributedInvite(admin, eventId, me.profileId, resolved);
        revalidatePath(`/event/${eventId}`);

        if (state === 'confirmed') {
            // Migration 080: reserve_spot can now confirm by CLAIMING a
            // ticket someone else already bought for the caller's email
            // (rather than freshly reserving) — ticket_id is present only
            // on that path; undefined on the pre-080 / ordinary confirm.
            return {
                ok: true,
                state: 'confirmed',
                spotNo: (data as any)?.spot_no ?? null,
                ticketId: (data as any)?.ticket_id ?? null,
            };
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
        if (state === 'ticket_pending') {
            // Migration 080: the caller has a ticket on someone else's
            // order that's still held (unpaid) — nothing to confirm yet.
            return { ok: true, state: 'ticket_pending' };
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
    await refreshAttributedInvite(admin, eventId, me.profileId, status);
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
    if (state === 'ticket_pending') {
        // Migration 080: caller already has a ticket on someone else's
        // still-unpaid order — no cart/payment to start for them.
        revalidatePath(`/event/${eventId}`);
        return { ok: true, state: 'ticket_pending' };
    }
    if (state === 'confirmed' && (data as any)?.ticket_id) {
        // Migration 080: reserve_spot claimed a pre-bought ticket instead of
        // reserving a fresh spot — they're already in, skip cart/payment.
        revalidatePath(`/event/${eventId}`);
        return { ok: true, state: 'confirmed', spotNo: (data as any)?.spot_no ?? null };
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

/** Result shape for cancelPaidRsvp — the error is a free-form human message
 *  (window closed, missing payment_ref, Medusa failure), unlike RsvpError's
 *  fixed enum, so it gets its own type rather than overloading RsvpResult. */
export type CancelPaidRsvpActionResult = { ok: true } | { ok: false; error: string };

/**
 * Member self-service "Cancel & get a full refund" for a confirmed PAID spot
 * (077). Only offered in the UI before the refund cutoff;
 * cancelPaidRsvpAndRefund re-checks the window server-side regardless of what
 * the button's disabled state showed, and refunds through the Medusa order —
 * cancel_rsvp itself refuses to release a paid spot (see 077).
 */
export async function cancelPaidRsvp(eventId: string): Promise<CancelPaidRsvpActionResult> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'Invalid event.' };
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Sign in required.' };

    const result = await cancelPaidRsvpAndRefund(eventId, me.profileId);
    if (!result.ok) return result;
    revalidatePath(`/event/${eventId}`);
    return { ok: true };
}

/** Whether the refund window is still open for this event (for the UI's
 *  disabled/enabled state on the Cancel & refund control). */
export async function checkRefundWindowOpen(eventId: string): Promise<boolean> {
    if (!UUID_RE.test(eventId)) return false;
    return getRefundWindowOpen(eventId);
}

/**
 * Multi-ticket packages (feature-gated). Reserves 1..5 seats via
 * reserve_tickets (seat 1 must be the caller's own identity — enforced
 * server-side by re-stamping it here rather than trusting the client's copy
 * of seat 1), then wires up the event cart with that hold's quantity. On
 * success the caller should navigate the browser to `redirect` — this never
 * throws, matching every other action on this page.
 */
export type ReserveEventTicketsResult =
    | { ok: true; redirect: string }
    | { ok: false; error: string };

export async function reserveEventTicketsAction(
    eventId: string,
    tierId: string,
    attendees: TicketAttendeeInput[],
): Promise<ReserveEventTicketsResult> {
    if (!UUID_RE.test(eventId) || !UUID_RE.test(tierId)) return { ok: false, error: 'Invalid event.' };
    if (!(await multiTicketsEnabled())) return { ok: false, error: 'Multi-ticket packages are not available.' };
    if (attendees.length < 1 || attendees.length > MAX_TICKETS_PER_ORDER) {
        return { ok: false, error: `Between 1 and ${MAX_TICKETS_PER_ORDER} tickets.` };
    }

    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Sign in to reserve tickets.' };

    // Seat 1 is always the caller — never trust the client's copy of it.
    const seat1 = attendees[0];
    const stamped: TicketAttendeeInput[] = [
        { ...seat1, name: me.displayName || seat1.name, email: (me.email || seat1.email).toLowerCase() },
        ...attendees.slice(1),
    ];

    // Validate the tier the same way startPackageCheckout does.
    const admin = getSupabaseAdmin();
    const { data: tier, error: tierError } = await admin
        .from('event_tiers')
        .select('id, event_id, active, medusa_product_id')
        .eq('id', tierId)
        .maybeSingle();
    if (tierError) console.error('[event/[id]] reserveEventTicketsAction tier load failed:', tierError.message);
    if (!tier || (tier as any).event_id !== eventId || !(tier as any).active) {
        return { ok: false, error: 'That tier is not available. Refresh and try again.' };
    }
    const medusaProductId = (tier as any).medusa_product_id as string | null;
    if (!medusaProductId) return { ok: false, error: 'That tier is not available. Refresh and try again.' };

    const result = await reserveTickets(eventId, tierId, stamped);
    if (!result.ok) {
        // reserveTickets() already turned the RPC's {state,detail} into a
        // plain-language message — see describeReserveFailure in event-tickets.ts.
        return { ok: false, error: result.error };
    }

    const cart = await createEventTicketsCart({
        eventId,
        tierId,
        profileId: me.profileId,
        medusaProductId,
        holdId: result.holdId,
        quantity: stamped.length,
    });
    if (!cart.ok) {
        // The hold stands (its own TTL frees it) — surface a retry-able error.
        console.error('[event/[id]] event tickets cart creation failed:', cart.error);
        return { ok: false, error: cart.error };
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
): Promise<{ state: RsvpState; spotNo: number | null; holdExpiresAt?: string | null }> {
    if (!UUID_RE.test(eventId)) return { state: null, spotNo: null };
    const me = await getConsumerProfile();
    if (!me) return { state: null, spotNo: null };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_rsvps')
        .select('status, hold_state, spot_no, hold_expires_at')
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
        return {
            state: 'held',
            spotNo: (data as any)?.spot_no ?? null,
            holdExpiresAt: ((data as any)?.hold_expires_at as string | null) ?? null,
        };
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
/**
 * Keep an ALREADY-attributed invite row in step with the member's RSVP.
 *
 * attributeInvite only fires when ?invite= is in the URL, which is the first
 * click and never again — so an invite row froze at whatever the member chose
 * that once. Run R12 watched one sit at 'going' through three later
 * transitions. The row is what the host reads to see whether an invitation
 * worked, so a stale one misreports the answer.
 *
 * Matches on (event, profile) rather than the token: by now the row is bound to
 * this profile, and the member no longer has the link in hand.
 */
async function refreshAttributedInvite(
    admin: ReturnType<typeof getSupabaseAdmin>,
    eventId: string,
    profileId: string,
    status: InviteRsvpStatus | null,
): Promise<void> {
    try {
        await admin
            .from('event_invites')
            .update({
                rsvp_status: status,
                rsvp_at: status ? new Date().toISOString() : null,
            })
            .eq('event_id', eventId)
            .eq('rsvp_profile_id', profileId);
    } catch {
        // Attribution is reporting, never a gate on the RSVP itself.
    }
}

async function attributeInvite(
    admin: ReturnType<typeof getSupabaseAdmin>,
    inviteToken: string | null | undefined,
    eventId: string,
    profileId: string,
    status: InviteRsvpStatus,
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
