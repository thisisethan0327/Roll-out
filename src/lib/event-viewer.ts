/**
 * Server-side "may the current viewer see this non-public event?" check,
 * shared by the /event/[id] layout (which owns the 404 status, see its header),
 * the page, the RSVP actions, checkout and /ics.
 *
 * Since migrations 088/089 the rule lives in the database:
 * rollout._can_view_event(p_event, p_profile) (service_role only) answers for
 * any viewer — signed out (profile null → only public passes), host, shop
 * staff, platform admin, invitee, and followers of a followers-only event.
 * If the RPC errors, the event is treated as locked (fail closed).
 */
import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getConsumerProfile, getRolloutMemberClient, type ConsumerProfile } from '@/lib/consumer';
import { fetchEventTeaser } from '@/lib/event-teasers';
import type { EventTeaser } from '@/lib/event-teaser-format';

export type EventVisibilityRow = {
    id: string;
    visibility: string | null;
    host_id: string | null;
    shop_id: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let rpcWarned = false;

/**
 * rollout._can_view_event(p_event, p_profile) via the service-role client.
 * Returns the boolean, or NULL when the function is not deployed yet (or any
 * other error) — callers treat null as "use the legacy rule".
 */
export async function rpcCanViewEvent(eventId: string, profileId: string | null): Promise<boolean | null> {
    try {
        const { data, error } = await getSupabaseAdmin().rpc('_can_view_event', {
            p_event: eventId,
            p_profile: profileId,
        });
        if (error) {
            // One line per process: before 088 lands this fires on every check.
            if (!rpcWarned) {
                rpcWarned = true;
                console.warn('[event-viewer] _can_view_event unavailable, treating as locked:', error.message);
            }
            return null;
        }
        return data === true;
    } catch (err) {
        console.warn('[event-viewer] _can_view_event failed, treating as locked:', (err as any)?.message ?? err);
        return null;
    }
}

/**
 * The full decision for one event row: public → yes; otherwise the DB rule
 * (rollout._can_view_event, migration 089). Any RPC failure counts as no. `viewer` may be
 * passed when the caller already resolved it (undefined = resolve here).
 */
export async function viewerCanViewEvent(
    ev: EventVisibilityRow,
    viewer?: ConsumerProfile | null,
): Promise<boolean> {
    if (ev.visibility === 'public') return true;
    const me = viewer === undefined ? await getConsumerProfile() : viewer;
    // Fail CLOSED: with 089 live, an RPC error means "can't tell", and a
    // non-public event must then stay locked (teaser or 404), never open.
    return (await rpcCanViewEvent(ev.id, me?.profileId ?? null)) === true;
}

/** getConsumerProfile, memoised for one server render (layout + metadata + page). */
export const currentViewer = cache(getConsumerProfile);

export type InviteClaimState = 'claimed' | 'already_yours' | 'taken' | 'not_found' | 'auth';

/**
 * Claim an event invite for the signed-in member (rollout.claim_event_invite,
 * migration 088). Memoised per request, so generateMetadata and the page run
 * it once. Returns null when signed out, the token is malformed, or the RPC
 * is not deployed yet — never throws; a failed claim just leaves the page as
 * it would have been without the token.
 */
export const claimEventInvite = cache(
    async (token: string): Promise<{ state: InviteClaimState | string; eventId: string | null } | null> => {
        if (!UUID_RE.test(token)) return null;
        const me = await currentViewer();
        if (!me) return null;
        try {
            const member = await getRolloutMemberClient();
            const { data, error } = await member.rpc('claim_event_invite', { p_token: token });
            if (error) {
                console.warn('[event-viewer] claim_event_invite unavailable/failed:', error.message);
                return null;
            }
            const state = (data as any)?.state;
            return typeof state === 'string' ? { state, eventId: (data as any)?.event_id ?? null } : null;
        } catch (err) {
            console.warn('[event-viewer] claim_event_invite failed:', (err as any)?.message ?? err);
            return null;
        }
    },
);

export type EventAccess =
    /** Render the full event (public, or a viewer who may see it). */
    | { kind: 'full' }
    /** Non-public and not for this viewer: render ONLY the teaser. */
    | { kind: 'locked'; teaser: EventTeaser; signedIn: boolean }
    /** Neither public nor a teaser (unknown / cancelled / past private). */
    | { kind: 'missing' };

/**
 * What /event/[id] should render for THIS request. Claims `inviteToken` first
 * (signed-in only) so a just-claimed invite unlocks the page on the same
 * request. Memoised per request so generateMetadata and the page agree.
 *
 * Never selects more than the gate columns from rollout.events here — the
 * full row is only loaded by the page after this returns 'full'.
 */
export const resolveEventAccess = cache(
    async (eventId: string, inviteToken: string | null): Promise<EventAccess> => {
        if (!UUID_RE.test(eventId)) return { kind: 'missing' };
        const me = await currentViewer();
        if (me && inviteToken) await claimEventInvite(inviteToken);

        const { data, error } = await getSupabaseAdmin()
            .from('events')
            .select('id, visibility, host_id, shop_id')
            .eq('id', eventId)
            .maybeSingle();
        if (error) console.error('[event-viewer] access gate load failed:', error.message);
        if (!data) return { kind: 'missing' };
        const row = data as EventVisibilityRow;

        if (await viewerCanViewEvent(row, me)) return { kind: 'full' };
        const teaser = await fetchEventTeaser(eventId);
        if (teaser) return { kind: 'locked', teaser, signedIn: !!me };
        return { kind: 'missing' };
    },
);
