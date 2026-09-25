/**
 * POST /api/app/event-checkout/resume — the mobile app's "Pay now" entry
 * point for an EXISTING unpaid hold (EventDetailScreen's HELD sticky CTA).
 * See docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract" (this route was
 * added after that doc was written — the app never persisted a cartId of its
 * own, e.g. the app was killed between `/start` and payment, or the buyer
 * started the hold on a different device, so there is nothing to resume from
 * client-side state).
 *
 * Body: `{ eventId }`. Auth: `Authorization: Bearer <Supabase access token>`,
 * same as every other route here.
 *
 * There is no cookie (the app never had one) and no stored cart id anywhere
 * in `rollout`'s schema — a Medusa cart is only ever addressable by its own
 * id or by querying Medusa itself. So this finds the caller's cart via the
 * ADMIN api (medusa-admin.ts's findLiveEventCartForCustomer — see that
 * function's doc comment) filtered to THIS event and THIS caller's own
 * `event_profile_id` stamp, matching the ownership rule /complete and
 * /release already enforce. When no live cart is found (expired, already
 * completed, never existed, or the admin lookup itself is unavailable) this
 * returns `{ ok:false, code:'no_hold' }` — the app falls back to "Pay on
 * web" for that case, never a client-code error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { ensureMedusaCustomerTokenForUser, getMedusaCustomerId } from '@/lib/medusa-customer';
import { findLiveEventCartForCustomer } from '@/lib/medusa-admin';
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
    if (!UUID_RE.test(eventId)) return bad('Invalid event.');

    // Resolved ONCE per request — see /start's doc comment for why.
    const tokenP = ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
    const authCtx: EventAuthCtx = {
        getAuthHeader: async () => {
            const t = await tokenP;
            return (t ? { Authorization: `Bearer ${t}` } : {}) as Record<string, string>;
        },
        getUid: async () => caller.user.id,
    };

    const medusaToken = await tokenP;
    if (!medusaToken) return bad('No hold to resume.', 'no_hold');

    const customerId = await getMedusaCustomerId(medusaToken);
    if (!customerId) return bad('No hold to resume.', 'no_hold');

    const cartId = await findLiveEventCartForCustomer(customerId, eventId, caller.profile.profileId);
    if (!cartId) return bad('No hold to resume.', 'no_hold');

    // Re-verify ownership from the cart's OWN metadata — never trust the
    // admin lookup's filter alone (same defense-in-depth /complete and
    // /release use for a client-supplied cartId).
    const existing = await getEventCartCore(authCtx, cartId);
    if (!existing || existing.meta.profileId !== caller.profile.profileId) {
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
    // countdown from the RSVP snapshot it polls independently of this call.
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
