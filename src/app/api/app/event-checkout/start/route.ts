/**
 * POST /api/app/event-checkout/start — the mobile app's in-app payment entry
 * point. See docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract".
 *
 * Does exactly what the web does, end to end, against the SAME core
 * functions the server actions call (event/[id]/actions.ts's
 * startPackageCheckoutCore / reserveEventTicketsCore, lib/event-cart-core.ts):
 *   1. reserve — reserve_tickets (multi-ticket packages, when enabled: ALWAYS
 *      used once the feature flag is on, exactly like the web's
 *      TiersSection.tsx routing every tier card through it regardless of
 *      quantity) or the single-spot reserve_spot path (flag off).
 *   2. create the Events-channel Medusa cart with the event contract stamped
 *      on its metadata.
 *   3. contact (member email) + address (body address, else the member's
 *      saved default Medusa address).
 *   4. the event-pickup shipping method (event carts are pickup-only — one
 *      method per shipping profile, mirroring CheckoutClient.tsx's
 *      submitShipping loop).
 *   5. init the Stripe payment session and hand back its client secret.
 *
 * Auth: `Authorization: Bearer <Supabase access token>`, verified server-side
 * via resolveAppCaller (lib/app-auth.ts) — never a user id from the body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import {
    MAX_TICKETS_PER_ORDER,
    SWEATER_SIZES,
    multiTicketsEnabled,
    type SweaterSize,
    type TicketAttendeeInput,
} from '@/lib/event-tickets';
import {
    startPackageCheckoutCore,
    reserveEventTicketsCore,
    type EventActionUserCtx,
} from '@/app/event/[id]/actions';
import {
    getEventCartCore,
    initEventStripePaymentSessionCore,
    listEventShippingOptionsCore,
    setEventCheckoutContactCore,
    setEventShippingMethodCore,
    type EventAuthCtx,
} from '@/lib/event-cart-core';
import { ensureMedusaCustomerTokenForUser } from '@/lib/medusa-customer';
import { loadDefaultShippingAddressForToken } from '@/lib/medusa-address';
import type { AddressInput } from '@/lib/medusa-types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZE_SET = new Set<string>(SWEATER_SIZES);

function bad(error: string, code?: string, status = 200, extra?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error, ...(code ? { code } : {}), ...(extra ?? {}) }, { status });
}

/**
 * Maps reserveEventTicketsCore's forwarded {state, seat} onto the documented
 * error codes (full, tier_full, duplicate_email, closed, auth). Anything else
 * (invalid attendee data, a plain write/RPC failure) has no dedicated code —
 * the human-readable `error` message still explains it.
 */
function codeForTicketState(state: string | undefined): string | undefined {
    switch (state) {
        case 'full':
        case 'tier_full':
        case 'duplicate_email':
        case 'closed':
        case 'auth':
            return state;
        default:
            return undefined;
    }
}

function codeForRsvpError(error: string): { code?: string; status: number } {
    switch (error) {
        case 'auth':
            return { code: 'auth', status: 401 };
        case 'closed':
            return { code: 'closed', status: 200 };
        case 'full':
            return { code: 'full', status: 200 };
        default:
            return { status: 200 };
    }
}

function normalizeBodyAddress(raw: any): AddressInput | null {
    if (!raw || typeof raw !== 'object') return null;
    const firstName = typeof raw.firstName === 'string' ? raw.firstName.trim() : '';
    const lastName = typeof raw.lastName === 'string' ? raw.lastName.trim() : '';
    const address1 = typeof raw.address1 === 'string' ? raw.address1.trim() : '';
    const city = typeof raw.city === 'string' ? raw.city.trim() : '';
    const province = typeof raw.province === 'string' ? raw.province.trim() : '';
    const postalCode = typeof raw.postalCode === 'string' ? raw.postalCode.trim() : '';
    const countryCode = typeof raw.countryCode === 'string' ? raw.countryCode.trim() : '';
    if (!firstName || !lastName || !address1 || !city || !province || !postalCode || !countryCode) return null;
    return {
        firstName,
        lastName,
        address1,
        address2: typeof raw.address2 === 'string' ? raw.address2 : undefined,
        city,
        province,
        postalCode,
        countryCode,
        phone: typeof raw.phone === 'string' ? raw.phone : undefined,
    };
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
    const tierId = typeof body?.tierId === 'string' ? body.tierId : '';
    const quantity = Number(body?.quantity ?? 1);
    if (!UUID_RE.test(eventId) || !UUID_RE.test(tierId)) return bad('Invalid event or tier.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_ORDER) {
        return bad(`Between 1 and ${MAX_TICKETS_PER_ORDER} tickets.`);
    }

    const ctx: EventActionUserCtx = {
        profileId: caller.profile.profileId,
        displayName: caller.profile.displayName,
        email: caller.profile.email,
        accessToken: caller.accessToken,
        user: caller.user,
    };

    const ticketsOn = await multiTicketsEnabled();
    let cartId: string;
    let holdExpiresAt: string | null = null;

    if (ticketsOn) {
        // Mirrors the web's TiersSection.tsx exactly: once multi-ticket
        // packages are enabled, EVERY reservation (including quantity 1)
        // goes through reserve_tickets, which requires name/email/size for
        // every seat (including seat 1 — the RPC still needs a size for the
        // caller's own seat even when they ARE the only attendee).
        const rawAttendees = Array.isArray(body?.attendees) ? body.attendees : [];
        if (rawAttendees.length !== quantity) {
            return bad('Attendee details are required for every seat.', 'invalid');
        }
        const attendees: TicketAttendeeInput[] = [];
        for (let i = 0; i < rawAttendees.length; i++) {
            const a = rawAttendees[i] ?? {};
            const name = typeof a.name === 'string' ? a.name.trim() : '';
            const email = typeof a.email === 'string' ? a.email.trim() : '';
            const size = typeof a.size === 'string' ? a.size.toUpperCase() : '';
            if (i > 0 && !name) return bad(`Seat ${i + 1}'s name is required.`, 'invalid');
            if (i > 0 && !email) return bad(`Seat ${i + 1}'s email doesn't look right.`, 'invalid');
            if (!SIZE_SET.has(size)) return bad(`Seat ${i + 1}'s sweater size is required.`, 'invalid');
            attendees.push({ name, email, size: size as SweaterSize });
        }
        // Seat 1 = caller — reserveEventTicketsCore re-stamps it server-side
        // regardless, but an empty placeholder here (the app prefills it from
        // the caller's own profile) still needs to satisfy the >0-length check.
        if (!attendees[0]) return bad('Attendee details are required for every seat.', 'invalid');

        const result = await reserveEventTicketsCore(eventId, tierId, attendees, ctx);
        if (!result.ok) {
            const code = codeForTicketState(result.state);
            return bad(result.error, code, 200, code === 'duplicate_email' && result.seat != null ? { seat: result.seat } : undefined);
        }
        cartId = result.cartId;
        holdExpiresAt = result.expiresAt;
    } else {
        if (quantity !== 1) return bad('Multi-ticket packages are not available.');

        const result = await startPackageCheckoutCore(eventId, tierId, ctx);
        if (!result.ok) {
            const { code, status } = codeForRsvpError(result.error);
            return bad(errorMessageForRsvp(result.error), code, status);
        }
        if (result.state === 'waitlisted') {
            return NextResponse.json({ ok: true, state: 'waitlisted', waitlistPosition: result.waitlistPosition });
        }
        if (result.state === 'ticket_pending') {
            return NextResponse.json({ ok: true, state: 'ticket_pending' });
        }
        if (result.state === 'claimed') {
            return NextResponse.json({ ok: true, state: 'confirmed', spotNo: result.spotNo });
        }
        cartId = result.cartId;
        holdExpiresAt = result.holdExpiresAt;
    }

    // ── contact + address ──────────────────────────────────────────────────
    const authCtx: EventAuthCtx = {
        getAuthHeader: async () => {
            const t = await ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
            return (t ? { Authorization: `Bearer ${t}` } : {}) as Record<string, string>;
        },
        getUid: async () => caller.user.id,
    };

    const medusaToken = await ensureMedusaCustomerTokenForUser(caller.accessToken, caller.user);
    if (!medusaToken) return bad('Could not connect your account to the store right now.');

    let address = normalizeBodyAddress(body?.address);
    if (!address) address = await loadDefaultShippingAddressForToken(medusaToken);
    if (!address) return bad('An address is required to check out.', 'address_required');

    const email = caller.profile.email || body?.address?.email || '';
    const contact = await setEventCheckoutContactCore(authCtx, cartId, email, address);
    if (!contact.ok) return bad(contact.error);

    // ── the event pickup shipping method (pickup-only lane; one call per
    //    shipping profile, exactly like CheckoutClient.tsx's submitShipping) ──
    const options = await listEventShippingOptionsCore(authCtx, cartId);
    const firstPerProfile = new Map<string, string>();
    for (const o of options) if (!firstPerProfile.has(o.profileId)) firstPerProfile.set(o.profileId, o.id);
    for (const optionId of firstPerProfile.values()) {
        const shipRes = await setEventShippingMethodCore(authCtx, cartId, optionId);
        if (!shipRes.ok) return bad(shipRes.error);
    }

    // ── Stripe payment session ──────────────────────────────────────────────
    const payment = await initEventStripePaymentSessionCore(authCtx, cartId);
    if (!payment.ok || !payment.data) return bad(payment.ok ? 'Could not start payment.' : payment.error);

    const finalCart = await getEventCartCore(authCtx, cartId);
    if (!finalCart) return bad('Could not load cart.');

    return NextResponse.json({
        ok: true,
        state: 'held',
        cartId,
        clientSecret: payment.data.clientSecret,
        publishableKey: STRIPE_PUBLISHABLE_KEY,
        // Medusa reports cart totals in MAJOR units (dollars, e.g. 12.34 — see
        // lib/medusa-types.ts's formatMoney, which .toFixed(2)s them directly);
        // Stripe's PaymentSheet needs MINOR units (integer cents).
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

function errorMessageForRsvp(error: string): string {
    switch (error) {
        case 'auth':
            return 'Sign in required.';
        case 'closed':
            return 'RSVPs are closed for this meet.';
        case 'full':
            return 'This meet is at capacity.';
        case 'tier':
            return 'That tier is not available. Refresh and try again.';
        case 'write':
            return "Couldn't reserve that spot — try again.";
        case 'config':
            return 'Could not start event checkout.';
        case 'invalid':
            return 'Invalid event.';
        case 'paid_spot':
            return 'That spot is already paid for.';
        default:
            return "Couldn't reserve that spot — try again.";
    }
}
