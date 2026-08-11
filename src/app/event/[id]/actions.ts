'use server';
/**
 * Member RSVP actions for /event/[id].
 *
 * Writes flow through the anon SSR client (getRolloutMemberClient) so the
 * rollout.event_rsvps `event_rsvps_write_self` RLS policy is the enforcement
 * boundary (profile_id must equal current_profile_id()). We only resolve the
 * caller's identity + validate business rules (capacity, past/cancelled) here.
 *
 * attending_count is trigger-maintained on the base table, so we never touch
 * it — we revalidate the page and let the fresh count render.
 */
import { revalidatePath } from 'next/cache';
import { getConsumerProfile, getRolloutMemberClient } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type RsvpChoice = 'going' | 'maybe' | 'declined';
export type RsvpResult =
    | { ok: true; status: RsvpChoice | null }
    | { ok: false; error: 'auth' | 'full' | 'closed' | 'invalid' | 'write' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID: RsvpChoice[] = ['going', 'maybe', 'declined'];

/**
 * Set (or clear, when status === null) the caller's RSVP for an event.
 * Returns a discriminated result the client turns into UI state — it never
 * throws for the expected cases (not signed in, full, closed).
 */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setRsvp(
    eventId: string,
    status: RsvpChoice | null,
    inviteToken?: string | null,
): Promise<RsvpResult> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'invalid' };
    if (status !== null && !VALID.includes(status)) return { ok: false, error: 'invalid' };

    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'auth' };

    // Load the event with the service-role client to read capacity/state. The
    // RSVP write itself is RLS-gated below.
    const admin = getSupabaseAdmin();
    const { data: ev } = await admin
        .from('events')
        .select('id, visibility, capacity, attending_count, cancelled_at, start_at')
        .eq('id', eventId)
        .maybeSingle();

    if (!ev || (ev as any).visibility !== 'public') return { ok: false, error: 'invalid' };
    if ((ev as any).cancelled_at) return { ok: false, error: 'closed' };
    if ((ev as any).start_at && new Date((ev as any).start_at).getTime() < Date.now()) {
        return { ok: false, error: 'closed' };
    }

    const member = await getRolloutMemberClient();

    // Clearing the RSVP: delete the row.
    if (status === null) {
        const { error } = await member
            .from('event_rsvps')
            .delete()
            .eq('event_id', eventId)
            .eq('profile_id', me.profileId);
        if (error) return { ok: false, error: 'write' };
        revalidatePath(`/event/${eventId}`);
        return { ok: true, status: null };
    }

    // Capacity guard — only blocks a *new* "going" when the event is full.
    if (status === 'going') {
        const cap = (ev as any).capacity as number | null;
        if (cap != null) {
            const { data: mine } = await member
                .from('event_rsvps')
                .select('status')
                .eq('event_id', eventId)
                .eq('profile_id', me.profileId)
                .maybeSingle();
            const alreadyGoing = (mine as any)?.status === 'going';
            const count = (ev as any).attending_count ?? 0;
            if (!alreadyGoing && count >= cap) return { ok: false, error: 'full' };
        }
    }

    const { error } = await member
        .from('event_rsvps')
        .upsert(
            { event_id: eventId, profile_id: me.profileId, status },
            { onConflict: 'event_id,profile_id' },
        );
    if (error) return { ok: false, error: 'write' };

    // Invite attribution: if the member arrived via ?invite=<token>, stamp the
    // matching event_invite's rsvp_status. The DB function verifies the token
    // belongs to this event AND was addressed to this member's email, so a
    // shared link can't misattribute. Best-effort — never fails the RSVP.
    if (inviteToken && TOKEN_RE.test(inviteToken)) {
        try {
            await admin.rpc('event_invite_attribute_rsvp', {
                p_token: inviteToken,
                p_event_id: eventId,
                p_profile_id: me.profileId,
                p_status: status,
            });
        } catch {
            // ignore — attribution is non-critical
        }
    }

    revalidatePath(`/event/${eventId}`);
    return { ok: true, status };
}
