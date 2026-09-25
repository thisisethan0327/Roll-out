/**
 * POST /api/app/event-checkout/complete — the mobile app calls this only
 * AFTER Stripe's PaymentSheet has reported success. See
 * docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract".
 *
 * Auth: `Authorization: Bearer <Supabase access token>`, verified server-side
 * via resolveAppCaller. Ownership: the cart's `event_profile_id` metadata
 * (stamped at /start) MUST match the caller's own profile — never trust the
 * cartId alone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { getRolloutMemberClientForToken } from '@/lib/consumer';
import { ensureMedusaCustomerTokenForUser } from '@/lib/medusa-customer';
import {
    completeEventCartCore,
    getEventCartCore,
    initEventStripePaymentSessionCore,
    type EventAuthCtx,
} from '@/lib/event-cart-core';
import { getRsvpSnapshotForProfile } from '@/app/event/[id]/actions';
import { multiTicketsEnabled, myTicketsForEventWithClient } from '@/lib/event-tickets';

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

    // Resolved ONCE per request — every core call below awaits this SAME
    // promise instead of re-running the full token exchange itself.
    const tokenP = ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
    const authCtx: EventAuthCtx = {
        getAuthHeader: async () => {
            const t = await tokenP;
            return (t ? { Authorization: `Bearer ${t}` } : {}) as Record<string, string>;
        },
        getUid: async () => caller.user.id,
    };

    const existing = await getEventCartCore(authCtx, cartId);
    if (!existing) return NextResponse.json({ ok: false, error: 'Cart not found.' }, { status: 404 });
    if (existing.meta.profileId !== caller.profile.profileId) {
        return NextResponse.json(
            { ok: false, error: 'This cart does not belong to you.', code: 'auth' },
            { status: 403 },
        );
    }
    const { eventId, ticketHoldId } = existing.meta;

    // Same retry-once-on-"payment session" logic as the web's
    // CheckoutClient.tsx finishOrder(): a declined attempt can leave the cart
    // without a usable session ("Payment sessions are required") — re-init
    // the Stripe session and retry exactly once.
    let complete = await completeEventCartCore(authCtx, cartId);
    if (!complete.ok && /payment session/i.test(complete.error ?? '')) {
        const again = await initEventStripePaymentSessionCore(authCtx, cartId);
        if (again.ok) complete = await completeEventCartCore(authCtx, cartId);
    }
    if (!complete.ok || !complete.data) {
        return NextResponse.json({ ok: false, error: complete.ok ? 'Could not place order.' : complete.error });
    }

    // Seat list for the "You're in — N tickets" screen. Multi-ticket packages
    // (feature-gated): the buyer's own seats from my_tickets(); otherwise (or
    // when the ticket hold group is absent from this cart) a single-seat
    // fallback built from the RSVP snapshot, mirroring the web confirmation
    // page's `orderSeats.length > 1 ? orderSeats : []` behaviour but always
    // returning at least the one seat the app contract expects.
    let tickets: { seat: number; name: string; size: string | null; status: string }[] = [];
    if (ticketHoldId && (await multiTicketsEnabled())) {
        const member = getRolloutMemberClientForToken(caller.accessToken);
        const rows = (await myTicketsForEventWithClient(member, eventId))
            .filter((t) => t.isBuyer)
            .sort((a, b) => a.seat - b.seat);
        tickets = rows.map((t) => ({ seat: t.seat, name: t.attendeeName, size: t.sweaterSize, status: t.status }));
    }
    if (tickets.length === 0) {
        const snap = await getRsvpSnapshotForProfile(eventId, caller.profile.profileId);
        tickets = [
            {
                seat: 1,
                name: caller.profile.displayName,
                size: null,
                status: snap.state === 'confirmed' ? 'confirmed' : 'held',
            },
        ];
    }

    return NextResponse.json({ ok: true, orderId: complete.data.orderId, tickets });
}
