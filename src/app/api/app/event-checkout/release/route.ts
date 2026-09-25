/**
 * POST /api/app/event-checkout/release — the buyer backed out of payment
 * before confirming; free the hold early rather than waiting out its ~15 min
 * TTL. See docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract" (marked
 * optional there — holds also expire on their own).
 *
 * The web has no dedicated "release" action to extract a core from — backing
 * out of a single-spot hold is exactly what setRsvp(eventId, null) already
 * does (cancel_rsvp frees the spot + promotes the waitlist), so this route
 * calls that SAME RPC, bearer-scoped to the caller instead of their cookie
 * session. A multi-ticket hold (reserve_tickets) is released with rollout
 * 082's release_ticket_hold, also as the caller. Response: `{ ok:true,
 * released }` — released=false means there was nothing left to free (already
 * paid, expired or replaced).
 *
 * Auth + ownership: same as /complete — the cart's `event_profile_id` must
 * match the caller.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { getRolloutMemberClientForToken } from '@/lib/consumer';
import { ensureMedusaCustomerTokenForUser } from '@/lib/medusa-customer';
import { getEventCartCore, type EventAuthCtx } from '@/lib/event-cart-core';

export async function POST(req: NextRequest) {
    const caller = await resolveAppCaller(bearerTokenFrom(req));
    if (!caller) {
        return NextResponse.json({ ok: false, error: 'Sign in required.', code: 'auth' }, { status: 401 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid request body.' });
    }
    const cartId = typeof body?.cartId === 'string' ? body.cartId : '';
    if (!cartId) return NextResponse.json({ ok: false, error: 'Missing cartId.' });

    // Resolved ONCE per request — see /start's doc comment for why.
    const tokenP = ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
    const authCtx: EventAuthCtx = {
        getAuthHeader: async () => {
            const t = await tokenP;
            return (t ? { Authorization: `Bearer ${t}` } : {}) as Record<string, string>;
        },
        getUid: async () => caller.user.id,
    };

    const existing = await getEventCartCore(authCtx, cartId);
    if (!existing) {
        // Already gone (expired/completed/never existed) — nothing to release.
        return NextResponse.json({ ok: true });
    }
    if (existing.meta.profileId !== caller.profile.profileId) {
        return NextResponse.json(
            { ok: false, error: 'This cart does not belong to you.', code: 'auth' },
            { status: 403 },
        );
    }

    const member = getRolloutMemberClientForToken(caller.accessToken);

    if (existing.meta.ticketHoldId) {
        // Multi-ticket hold — rollout 082 release_ticket_hold, called AS the
        // caller: it only releases the caller's own hold (else 'forbidden'),
        // expires its held tickets, drops the unpaid held rsvp row and promotes
        // the waitlist. A hold already paid, expired or replaced is a 'noop'.
        const { data, error } = await member.rpc('release_ticket_hold', { p_hold_id: existing.meta.ticketHoldId });
        if (error) {
            console.error('[event-checkout/release] release_ticket_hold failed:', error.message);
            return NextResponse.json({ ok: false, error: 'Could not release the hold.' });
        }
        const state = (data as any)?.state as string | undefined;
        if (state === 'forbidden' || state === 'auth') {
            return NextResponse.json(
                { ok: false, error: 'This hold does not belong to you.', code: 'auth' },
                { status: 403 },
            );
        }
        // released | noop | not_found: either freed now, or nothing left to free.
        return NextResponse.json({ ok: true, released: state === 'released' });
    }

    const { error } = await member.rpc('cancel_rsvp', { p_event: existing.meta.eventId });
    if (error) {
        // 077: a confirmed PAID spot raises P0001 'paid_spot: …' instead of
        // releasing — shouldn't be reachable from an unpaid /start hold, but
        // handled the same way setRsvp does rather than surfacing raw SQL text.
        if (/paid_spot/i.test(error.message)) {
            return NextResponse.json({ ok: false, error: 'That spot is already paid for.', code: 'paid_spot' });
        }
        return NextResponse.json({ ok: false, error: 'Could not release the hold.' });
    }

    return NextResponse.json({ ok: true });
}
