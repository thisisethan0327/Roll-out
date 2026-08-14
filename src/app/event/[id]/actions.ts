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
 * Writes flow through the anon SSR client (getRolloutMemberClient); the RPCs are
 * SECURITY DEFINER and resolve the caller via current_profile_id() (self-only).
 * attending_count stays trigger-maintained, so we only revalidate and re-render.
 */
import { revalidatePath } from 'next/cache';
import { getConsumerProfile, getRolloutMemberClient } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type RsvpChoice = 'going' | 'maybe' | 'declined';
/** The member's resolved RSVP state after a write (or as loaded for the page). */
export type RsvpState = 'confirmed' | 'waitlisted' | 'maybe' | 'declined' | null;
export type RsvpResult =
    | { ok: true; state: RsvpState; spotNo?: number | null; waitlistPosition?: number | null }
    | { ok: false; error: 'auth' | 'full' | 'closed' | 'invalid' | 'write' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID: RsvpChoice[] = ['going', 'maybe', 'declined'];
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set (or clear, when status === null) the caller's RSVP for an event.
 * Returns a discriminated result the client turns into UI state — it never
 * throws for the expected cases (not signed in, full/closed, waitlisted).
 */
export async function setRsvp(
    eventId: string,
    status: RsvpChoice | null,
    inviteToken?: string | null,
): Promise<RsvpResult> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'invalid' };
    if (status !== null && !VALID.includes(status)) return { ok: false, error: 'invalid' };

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

    // ── Going → the atomic reserve_spot RPC (confirm or waitlist). ──
    if (status === 'going') {
        const { data, error } = await member.rpc('reserve_spot', { p_event: eventId });
        if (error) return { ok: false, error: 'write' };
        const state = (data as any)?.state as string | undefined;
        if (state === 'auth') return { ok: false, error: 'auth' };
        if (state === 'closed' || state === 'not_found') return { ok: false, error: 'closed' };

        // Invite attribution (best-effort) — mirrors the pre-E0 behavior.
        await attributeInvite(admin, inviteToken, eventId, me.profileId, 'going');
        revalidatePath(`/event/${eventId}`);

        if (state === 'confirmed') {
            return { ok: true, state: 'confirmed', spotNo: (data as any)?.spot_no ?? null };
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
