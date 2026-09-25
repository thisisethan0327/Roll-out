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
 * session. A multi-ticket hold (reserve_tickets) has no early-release RPC in
 * the migration-080 contract — re-calling reserve_tickets with different
 * seats replaces it, and otherwise it simply expires — so that case is a
 * documented no-op here (still `ok:true`; nothing to release early).
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

    const authCtx: EventAuthCtx = {
        getAuthHeader: async () => {
            const t = await ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
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

    if (existing.meta.ticketHoldId) {
        // Multi-ticket hold — no early-release RPC exists; it expires on its
        // own TTL. Nothing more to do.
        return NextResponse.json({ ok: true });
    }

    const member = getRolloutMemberClientForToken(caller.accessToken);
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
