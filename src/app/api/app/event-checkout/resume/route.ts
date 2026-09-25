/**
 * POST /api/app/event-checkout/resume — the mobile app's "Pay now" entry
 * point for an EXISTING unpaid hold (EventDetailScreen's HELD sticky CTA).
 * See docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract" (this route was
 * added after that doc was written).
 *
 * Body: `{ eventId, cartId }`. Auth: `Authorization: Bearer <Supabase access
 * token>`, same as every other route here.
 *
 * There is no cookie (the app never had one) and — unlike the web — no admin
 * cart-list endpoint to fall back on (Medusa v2 has no `GET /admin/carts`;
 * confirmed 404 against production). So the app itself persists `cartId`
 * locally the moment `/start` returns a `held` result (AsyncStorage, keyed
 * per user+event — see appCheckout.ts/EventDetailScreen on the mobile side)
 * and sends it back here.
 *
 * TWO checks gate a re-init of the Stripe payment session, in this order,
 * and BOTH must pass before `initEventStripePaymentSessionCore` runs:
 *
 *   1. Ownership from the cart's OWN metadata (never the client-supplied
 *      cartId alone) — read with the CALLER's own Medusa token, exactly like
 *      /complete does: `event_profile_id`/`event_id` must match.
 *   2. The HOLD itself is still LIVE — checked against the source of truth
 *      (event_rsvps / the ticket-hold RPC), not just "the cart still exists".
 *      A hold's ~15 min TTL can lapse while the Medusa cart (and its old
 *      payment session) is still sitting there; re-initing a session and
 *      charging a card for a spot that's no longer reserved would capture
 *      money now, then need a refund once the completion gate's own RSVP
 *      re-check rejects it (platform review, 2026-09-26). Checking liveness
 *      BEFORE touching Stripe, not after, is what avoids that charge.
 *
 * Any failure of either check collapses to `{ ok:false, code:'no_hold' }` —
 * the app clears its local record and offers "Reserve again" rather than a
 * raw error (a stale/expired hold and a foreign cart look identical to the
 * caller either way).
 *
 * Cart type here (medusa-types.ts) doesn't expose `completed_at`, so an
 * already-completed cart isn't independently detectable at that layer today
 * — in practice it's covered anyway: completing a cart also flips its RSVP
 * to confirmed (order.placed subscriber) or consumes the ticket hold, so
 * check 2 above (state/liveness) already comes back false for it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { ensureMedusaCustomerTokenForUser } from '@/lib/medusa-customer';
import { getRsvpSnapshotForProfile } from '@/app/event/[id]/actions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
    getEventCartCore,
    initEventStripePaymentSessionCore,
    type EventAuthCtx,
} from '@/lib/event-cart-core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(error: string, code?: string) {
    return NextResponse.json({ ok: false, error, ...(code ? { code } : {}) });
}

/**
 * Multi-ticket path: `ticket_hold_status` is granted to `service_role` (not
 * the member's own RLS-scoped client), so this runs through the admin client
 * exactly like event-tickets.ts's other service-only RPCs. Requires the hold
 * to be live AND stamped for THIS event and THIS caller — a hold id living
 * on a cart that somehow drifted (shouldn't happen, but never trusted blind)
 * must not let a different caller/event ride through.
 */
async function ticketHoldStillLive(
    holdId: string,
    eventId: string,
    profileId: string,
): Promise<{ live: boolean; expiresAt: string | null }> {
    try {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin.rpc('ticket_hold_status', { p_hold_id: holdId });
        if (error) {
            console.error('[event-checkout/resume] ticket_hold_status failed:', error.message);
            return { live: false, expiresAt: null };
        }
        const live = Boolean((data as any)?.live);
        const sameEvent = (data as any)?.event_id === eventId;
        const samePurchaser = (data as any)?.purchaser_profile_id === profileId;
        if (!live || !sameEvent || !samePurchaser) return { live: false, expiresAt: null };
        return { live: true, expiresAt: (data as any)?.expires_at ?? null };
    } catch (e: any) {
        console.error('[event-checkout/resume] ticket_hold_status threw:', e?.message ?? e);
        return { live: false, expiresAt: null };
    }
}

export async function POST(req: NextRequest) {
    const caller = await resolveAppCaller(bearerTokenFrom(req));
    if (!caller) {
        return NextResponse.json({ ok: false, error: 'Sign in required.', code: 'auth' }, { status: 401 });
    }

    if (!STRIPE_PUBLISHABLE_KEY) {
        return bad('Payments are not configured.');
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return bad('Invalid request body.');
    }
    const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
    const cartId = typeof body?.cartId === 'string' ? body.cartId : '';
    if (!UUID_RE.test(eventId)) return bad('Invalid event.');
    if (!cartId) return bad('No hold to resume.', 'no_hold');

    // Resolved ONCE per request — see /start's doc comment for why.
    const tokenP = ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
    const authCtx: EventAuthCtx = {
        getAuthHeader: async () => {
            const t = await tokenP;
            return (t ? { Authorization: `Bearer ${t}` } : {}) as Record<string, string>;
        },
        getUid: async () => caller.user.id,
    };

    // Check 1 — ownership, exactly like /complete: read the cart with the
    // CALLER's own token and re-verify its stamped metadata.
    const existing = await getEventCartCore(authCtx, cartId);
    if (!existing) return bad('No hold to resume.', 'no_hold');
    if (existing.meta.profileId !== caller.profile.profileId || existing.meta.eventId !== eventId) {
        return bad('No hold to resume.', 'no_hold');
    }

    // Check 2 — the hold is still LIVE. Must happen BEFORE
    // initEventStripePaymentSessionCore: re-initing a payment session for a
    // hold that already expired would let the card be charged for a spot
    // that's no longer reserved, only to be refunded once the completion
    // gate's own re-check rejects it.
    let holdExpiresAt: string | null;
    if (existing.meta.ticketHoldId) {
        const status = await ticketHoldStillLive(existing.meta.ticketHoldId, eventId, caller.profile.profileId);
        if (!status.live) return bad('No hold to resume.', 'no_hold');
        holdExpiresAt = status.expiresAt;
    } else {
        const snap = await getRsvpSnapshotForProfile(eventId, caller.profile.profileId);
        const expiresAtMs = snap.holdExpiresAt ? new Date(snap.holdExpiresAt).getTime() : NaN;
        if (snap.state !== 'held' || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
            return bad('No hold to resume.', 'no_hold');
        }
        holdExpiresAt = snap.holdExpiresAt ?? null;
    }

    const payment = await initEventStripePaymentSessionCore(authCtx, cartId);
    if (!payment.ok || !payment.data) {
        return bad(payment.ok ? 'Could not start payment.' : payment.error);
    }

    const finalCart = await getEventCartCore(authCtx, cartId);
    if (!finalCart) return bad('Could not load cart.');

    return NextResponse.json({
        ok: true,
        state: 'held',
        cartId,
        clientSecret: payment.data.clientSecret,
        publishableKey: STRIPE_PUBLISHABLE_KEY,
        amount: Math.round(finalCart.cart.total * 100),
        currency: finalCart.cart.currencyCode,
        holdExpiresAt,
        lines: finalCart.cart.items.map((it) => ({
            title: it.productTitle,
            quantity: it.quantity,
            total: it.total,
        })),
        subtotal: finalCart.cart.subtotal,
        tax: finalCart.cart.taxTotal,
        total: finalCart.cart.total,
    });
}
