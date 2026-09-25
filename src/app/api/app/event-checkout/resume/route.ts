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
 * and sends it back here. Ownership is verified exactly like /complete does:
 * read the cart with the CALLER's own Medusa token and require its stamped
 * `event_profile_id`/`event_id` metadata to match — the client-supplied
 * cartId is never trusted on its own. When the cart can't be found, isn't
 * this caller's, is for a different event, or is already completed, this
 * returns `{ ok:false, code:'no_hold' }` and the app falls back to "Pay on
 * web" rather than surfacing a raw error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { ensureMedusaCustomerTokenForUser } from '@/lib/medusa-customer';
import { getRsvpSnapshotForProfile } from '@/app/event/[id]/actions';
import {
    getEventCartCore,
    initEventStripePaymentSessionCore,
    type EventAuthCtx,
} from '@/lib/event-cart-core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(error: string, code?: string) {
    return NextResponse.json({ ok: false, error, ...(code ? { code } : {}) });
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

    // Ownership, exactly like /complete: read the cart with the CALLER's own
    // token and re-verify its stamped metadata — never trust the client's
    // cartId alone. A mismatch (foreign cart, wrong event, or the cart is
    // gone/expired/already completed) all collapse to the same 'no_hold'
    // outcome so the app can't distinguish "not yours" from "gone".
    const existing = await getEventCartCore(authCtx, cartId);
    if (!existing) return bad('No hold to resume.', 'no_hold');
    if (existing.meta.profileId !== caller.profile.profileId || existing.meta.eventId !== eventId) {
        return bad('No hold to resume.', 'no_hold');
    }

    const payment = await initEventStripePaymentSessionCore(authCtx, cartId);
    if (!payment.ok || !payment.data) {
        return bad(payment.ok ? 'Could not start payment.' : payment.error);
    }

    const finalCart = await getEventCartCore(authCtx, cartId);
    if (!finalCart) return bad('Could not load cart.');

    // Best-effort — event_rsvps.hold_expires_at covers the single-spot path;
    // a multi-ticket hold's own expiry isn't exposed through this snapshot,
    // so this can come back null there. The app already tracks its own
    // countdown from the RSVP snapshot it polls independently of this call,
    // and from the holdExpiresAt it persisted alongside this cartId.
    const snap = await getRsvpSnapshotForProfile(eventId, caller.profile.profileId);

    return NextResponse.json({
        ok: true,
        state: 'held',
        cartId,
        clientSecret: payment.data.clientSecret,
        publishableKey: STRIPE_PUBLISHABLE_KEY,
        amount: Math.round(finalCart.cart.total * 100),
        currency: finalCart.cart.currencyCode,
        holdExpiresAt: snap.holdExpiresAt ?? null,
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
