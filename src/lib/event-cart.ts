'use server';

/**
 * Event-package cart + checkout — Medusa Store API server actions scoped to
 * the walled EVENTS sales channel (E2/E3 event-tier wire).
 *
 * Mirrors lib/medusa-cart.ts deliberately, but is a SEPARATE lane on purpose:
 *  - Its own cookie (`rollout_event_cart_id`) so an event package never mixes
 *    with the member's regular store cart (one package line only).
 *  - Every request carries the EVENTS publishable key — a server-side-only
 *    secret (EVENTS_MEDUSA_PUBLISHABLE_KEY, no NEXT_PUBLIC prefix, never
 *    returned to the client) — so event products stay invisible to the public
 *    storefront and orders attribute to the walled Events channel.
 *  - The cart is created with `sales_channel_id` = EVENTS_SALES_CHANNEL_ID and
 *    its metadata MUST carry the event contract: `event_id`, `event_tier_id`,
 *    `event_profile_id`. Medusa's cart-completion gate verifies a live RSVP
 *    server-side against that metadata, and the order.placed subscriber flips
 *    the held RSVP to confirmed after payment — omit the stamp and completion
 *    fails closed.
 *
 * COOKIE-FREE CORE: every function below is a thin wrapper — it resolves the
 * member's Medusa token + the `rollout_event_cart_id` cookie, then delegates
 * to lib/event-cart-core.ts's cookie-free equivalents (a plain module,
 * without 'use server', since its functions take a closure-typed `EventAuthCtx`
 * argument that a 'use server' export cannot carry). The mobile app's
 * /api/app/event-checkout/* routes call those SAME core functions directly
 * with a bearer-token-derived ctx + an explicit cartId instead of a cookie —
 * see docs/IN_APP_PAYMENT_PLAN_2026-09-25.md. Web behaviour is unchanged.
 */
import { cookies } from 'next/headers';
import { ensureMedusaCustomerToken, getSessionUserId } from './medusa-customer';
import {
    type EventAuthCtx,
    completeEventCartCore,
    createEventPackageCartCore,
    createEventTicketsCartCore,
    eventsConfigured,
    getEventCartCore,
    initEventStripePaymentSessionCore,
    listEventShippingOptionsCore,
    setEventCheckoutContactCore,
    setEventShippingMethodCore,
} from './event-cart-core';
import type { ActionResult, AddressInput, Cart, EventCartMeta, ShippingOption } from './medusa-types';

const EVENT_CART_COOKIE = 'rollout_event_cart_id';

/**
 * The member's Medusa token, REQUIRED for every event request.
 *
 * This is the one place event carts differ from store carts on purpose. In
 * lib/medusa-cart.ts attaching a customer is best-effort, because a guest
 * checkout is a valid checkout. An event package is never a guest purchase: it
 * is tied to an RSVP held by a profile, and the backend's completion gate 0a
 * refuses a cart whose customer has no account unless the channel is in
 * GUEST_CHECKOUT_ALLOWED_CHANNELS — which the Events channel is not.
 *
 * Run R12 measured what that costs when the cart is anonymous: the member
 * reached PLACE ORDER, Stripe authorised AND CAPTURED, and only then was the
 * order refused. Sending the token from the first request means Medusa binds
 * the cart to the real customer instead of minting a guest, so the gate has
 * nothing to refuse. It also puts event orders on /me/orders, which they never
 * reached as guest orders.
 *
 * Returns {} (no Authorization) when there is no session; callers refuse
 * BEFORE taking money.
 */
async function eventAuthHeader(): Promise<Record<string, string>> {
    const token = await ensureMedusaCustomerToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The cookie-session ctx every web action below builds ONCE and passes to the core. */
function cookieSessionCtx(): EventAuthCtx {
    return { getAuthHeader: eventAuthHeader, getUid: getSessionUserId };
}

async function getCartIdCookie(): Promise<string | null> {
    const store = await cookies();
    return store.get(EVENT_CART_COOKIE)?.value ?? null;
}
async function setCartIdCookie(id: string): Promise<void> {
    const store = await cookies();
    store.set(EVENT_CART_COOKIE, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        // Short-lived on purpose: the RSVP hold behind this cart expires in
        // ~15 minutes, so a day-old event cart is already dead weight.
        maxAge: 60 * 60 * 24,
    });
}
async function clearCartIdCookie(): Promise<void> {
    const store = await cookies();
    store.delete(EVENT_CART_COOKIE);
}

// ── public reads ────────────────────────────────────────────────────────────
/**
 * The member's current event cart, with the event contract it was stamped
 * with. Returns null when there is no cart or the stamp is missing/corrupt —
 * callers use meta.eventId to verify the cart belongs to THEIR event page.
 */
export async function getEventCart(): Promise<{ cart: Cart; meta: EventCartMeta } | null> {
    if (!eventsConfigured()) return null;
    const id = await getCartIdCookie();
    if (!id) return null;
    return getEventCartCore(cookieSessionCtx(), id);
}

// ── cart creation ───────────────────────────────────────────────────────────
/**
 * Create (or reuse) the one-package event cart for a reserved tier. See
 * event-cart-core.ts's createEventPackageCartCore for the actual logic; this
 * wrapper only adds the cookie read/write/clear around it.
 */
export async function createEventPackageCart(input: {
    eventId: string;
    tierId: string;
    profileId: string;
    medusaProductId: string;
}): Promise<ActionResult<{ cartId: string }>> {
    const existingCartId = await getCartIdCookie();
    const result = await createEventPackageCartCore(cookieSessionCtx(), input, existingCartId);
    if (result.staleCartId) await clearCartIdCookie();
    if (!result.ok) return { ok: false, error: result.error };
    await setCartIdCookie(result.cartId);
    return { ok: true, data: { cartId: result.cartId } };
}

/**
 * Multi-ticket packages (feature-gated — see lib/event-tickets.ts's
 * multiTicketsEnabled). See event-cart-core.ts's createEventTicketsCartCore
 * for the actual logic; this wrapper only adds the cookie handling.
 */
export async function createEventTicketsCart(input: {
    eventId: string;
    tierId: string;
    profileId: string;
    medusaProductId: string;
    holdId: string;
    quantity: number;
}): Promise<ActionResult<{ cartId: string }>> {
    const existingCartId = await getCartIdCookie();
    const result = await createEventTicketsCartCore(cookieSessionCtx(), input, existingCartId);
    if (result.staleCartId) await clearCartIdCookie();
    if (!result.ok) return { ok: false, error: result.error };
    await setCartIdCookie(result.cartId);
    return { ok: true, data: { cartId: result.cartId } };
}

// ── checkout (same endpoints as the store flow, events key + event cookie) ──
export async function setEventCheckoutContact(
    email: string,
    address: AddressInput,
): Promise<ActionResult<Cart>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    return setEventCheckoutContactCore(cookieSessionCtx(), cartId, email, address);
}

export async function listEventShippingOptions(): Promise<ShippingOption[]> {
    const cartId = await getCartIdCookie();
    if (!cartId) return [];
    return listEventShippingOptionsCore(cookieSessionCtx(), cartId);
}

export async function setEventShippingMethod(optionId: string): Promise<ActionResult<Cart>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    return setEventShippingMethodCore(cookieSessionCtx(), cartId, optionId);
}

/**
 * Initialize a Stripe payment session and return its client_secret for the
 * browser card element. Creates the payment collection first if needed.
 */
export async function initEventStripePaymentSession(): Promise<
    ActionResult<{ clientSecret: string }>
> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    return initEventStripePaymentSessionCore(cookieSessionCtx(), cartId);
}

/**
 * Complete the event cart after Stripe confirms the payment. Medusa's
 * completion gate re-verifies the live RSVP against the cart metadata; the
 * order.placed subscriber then flips the held RSVP to confirmed — the
 * confirmation page polls for that flip.
 */
export async function completeEventCart(): Promise<ActionResult<{ orderId: string }>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    const result = await completeEventCartCore(cookieSessionCtx(), cartId);
    if (result.ok) await clearCartIdCookie();
    return result;
}
