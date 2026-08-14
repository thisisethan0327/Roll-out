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
 * medusa-cart.ts keeps its internals module-private (medusaFetch, cookie
 * helpers, normalizeCart), so the minimal pieces are duplicated here rather
 * than restructuring the proven store flow. Vendor attribution is intentionally
 * absent: event packages belong to the event, not a selling shop.
 */
import { cookies } from 'next/headers';
import { MEDUSA_URL, MEDUSA_REGION_ID } from './medusa';
import type {
    ActionResult,
    AddressInput,
    Cart,
    CartLine,
    EventCartMeta,
    ShippingOption,
} from './medusa-types';

const EVENT_CART_COOKIE = 'rollout_event_cart_id';
const PROVIDER_ID = process.env.MEDUSA_STRIPE_PROVIDER_ID || 'pp_stripe_stripe';

// Server-side-only Events channel credentials. NO in-code fallback: unset env
// → event checkout refuses loudly instead of leaking onto the public channel.
const EVENTS_SALES_CHANNEL_ID = process.env.EVENTS_SALES_CHANNEL_ID || '';
const EVENTS_MEDUSA_PUBLISHABLE_KEY = process.env.EVENTS_MEDUSA_PUBLISHABLE_KEY || '';

const CART_FIELDS =
    '*items,*items.variant,*items.product,+items.total,+items.unit_price,+items.metadata,' +
    '*shipping_methods,*shipping_address,*payment_collection,+metadata,' +
    '*payment_collection.payment_sessions,+subtotal,+item_subtotal,+shipping_total,+tax_total,+total,+item_total';

function eventsConfigured(): boolean {
    return Boolean(EVENTS_SALES_CHANNEL_ID && EVENTS_MEDUSA_PUBLISHABLE_KEY);
}

function eventMedusaHeaders(): Record<string, string> {
    return {
        'x-publishable-api-key': EVENTS_MEDUSA_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
    };
}

// ── low-level fetch (duplicated from medusa-cart.ts — its copy is private) ──
async function eventMedusaFetch<T = any>(
    path: string,
    init?: RequestInit & { query?: Record<string, string | string[]> },
): Promise<T> {
    const url = new URL(`${MEDUSA_URL}${path}`);
    if (init?.query) {
        for (const [k, v] of Object.entries(init.query)) {
            if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
            else url.searchParams.set(k, v);
        }
    }
    const res = await fetch(url.toString(), {
        ...init,
        headers: { ...eventMedusaHeaders(), ...(init?.headers || {}) },
        cache: 'no-store',
    });
    const text = await res.text();
    let json: any = {};
    try {
        json = text ? JSON.parse(text) : {};
    } catch {
        json = { raw: text };
    }
    if (!res.ok) {
        const msg = json?.message || json?.error || `Medusa ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : `Medusa ${res.status}`);
    }
    return json as T;
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

// ── normalization ───────────────────────────────────────────────────────────
function num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** The event contract stamped on the cart at creation (null if missing). */
function metaOf(raw: any): EventCartMeta | null {
    const m = (raw?.metadata ?? {}) as Record<string, any>;
    const eventId = typeof m.event_id === 'string' ? m.event_id : null;
    const tierId = typeof m.event_tier_id === 'string' ? m.event_tier_id : null;
    const profileId = typeof m.event_profile_id === 'string' ? m.event_profile_id : null;
    if (!eventId || !tierId || !profileId) return null;
    return { eventId, tierId, profileId };
}

/**
 * Same Cart shape the store checkout renders — vendor fields stay empty (an
 * event package belongs to the event, not a selling shop).
 */
function normalizeEventCart(raw: any): Cart {
    const items: CartLine[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
        id: it.id,
        productTitle: it.product_title ?? it.title ?? 'Event package',
        variantTitle: it.variant_title ?? it.variant?.title ?? null,
        productHandle: it.product_handle ?? it.product?.handle ?? null,
        thumbnail: it.thumbnail ?? it.product?.thumbnail ?? null,
        quantity: num(it.quantity),
        unitPrice: num(it.unit_price),
        total: num(it.total ?? it.unit_price * it.quantity),
        vendor: null,
        shopName: null,
        shopHandle: null,
    }));

    return {
        id: raw.id,
        email: raw.email ?? null,
        currencyCode: raw.currency_code ?? 'usd',
        items,
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        // items-only: Medusa's `subtotal` includes any attached shipping method
        subtotal: num(raw.item_subtotal ?? raw.item_total ?? raw.subtotal),
        shippingTotal: num(raw.shipping_total),
        taxTotal: num(raw.tax_total),
        total: num(raw.total),
        hasShippingAddress: Boolean(raw.shipping_address?.address_1),
        shippingOptionId: raw.shipping_methods?.[0]?.shipping_option_id ?? null,
        vendor: { shopId: null, slug: null, name: null, handle: null },
        vendors: [],
        isMultiVendor: false,
    };
}

async function fetchRawCart(id: string): Promise<any | null> {
    try {
        const { cart } = await eventMedusaFetch<{ cart: any }>(`/store/carts/${id}`, {
            method: 'GET',
            query: { fields: CART_FIELDS },
        });
        return cart ?? null;
    } catch {
        return null;
    }
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
    const raw = await fetchRawCart(id);
    if (!raw) return null;
    const meta = metaOf(raw);
    if (!meta) return null;
    return { cart: normalizeEventCart(raw), meta };
}

// ── cart creation ───────────────────────────────────────────────────────────
/**
 * Create (or reuse) the one-package event cart for a reserved tier: Events
 * channel, contract metadata, the tier product's first variant × 1. Reuses an
 * existing cart only when it matches the SAME event + tier and still has its
 * line — anything else is torn down and replaced so the cart can never carry
 * a stale package for a different event.
 */
export async function createEventPackageCart(input: {
    eventId: string;
    tierId: string;
    profileId: string;
    medusaProductId: string;
}): Promise<ActionResult<{ cartId: string }>> {
    if (!eventsConfigured()) {
        return { ok: false, error: 'Event checkout is not configured.' };
    }
    const { eventId, tierId, profileId, medusaProductId } = input;
    if (!eventId || !tierId || !profileId || !medusaProductId) {
        return { ok: false, error: 'Missing event package details.' };
    }

    // Retry-friendly: a cart already stamped for this exact event+tier with its
    // package line intact is simply reused (e.g. member bounced off checkout).
    const existingId = await getCartIdCookie();
    if (existingId) {
        const raw = await fetchRawCart(existingId);
        const meta = raw ? metaOf(raw) : null;
        if (
            meta &&
            meta.eventId === eventId &&
            meta.tierId === tierId &&
            meta.profileId === profileId &&
            Array.isArray(raw.items) &&
            raw.items.length > 0
        ) {
            return { ok: true, data: { cartId: existingId } };
        }
        await clearCartIdCookie();
    }

    try {
        // The tier's Medusa product → first variant, quantity 1 (the contract).
        const { products } = await eventMedusaFetch<{ products: any[] }>(`/store/products`, {
            method: 'GET',
            query: {
                'id[]': [medusaProductId],
                region_id: MEDUSA_REGION_ID,
                fields: 'id,*variants',
                limit: '1',
            },
        });
        const variantId: string | undefined = products?.[0]?.variants?.[0]?.id;
        if (!variantId) {
            return { ok: false, error: 'This package is not available right now.' };
        }

        const { cart } = await eventMedusaFetch<{ cart: any }>(`/store/carts`, {
            method: 'POST',
            body: JSON.stringify({
                region_id: MEDUSA_REGION_ID,
                sales_channel_id: EVENTS_SALES_CHANNEL_ID,
                metadata: {
                    event_id: eventId,
                    event_tier_id: tierId,
                    event_profile_id: profileId,
                },
            }),
        });

        await eventMedusaFetch(`/store/carts/${cart.id}/line-items`, {
            method: 'POST',
            body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
        });

        await setCartIdCookie(cart.id);
        return { ok: true, data: { cartId: cart.id } };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not start event checkout.' };
    }
}

// ── checkout (same endpoints as the store flow, events key + event cookie) ──
export async function setEventCheckoutContact(
    email: string,
    address: AddressInput,
): Promise<ActionResult<Cart>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    const shipping = {
        first_name: address.firstName,
        last_name: address.lastName,
        address_1: address.address1,
        address_2: address.address2 || '',
        city: address.city,
        province: address.province,
        postal_code: address.postalCode,
        country_code: address.countryCode.toLowerCase(),
        phone: address.phone || '',
    };
    try {
        await eventMedusaFetch(`/store/carts/${cartId}`, {
            method: 'POST',
            body: JSON.stringify({
                email,
                shipping_address: shipping,
                billing_address: shipping,
            }),
        });
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not save your details.' };
    }
    const raw = await fetchRawCart(cartId);
    return { ok: true, data: raw ? normalizeEventCart(raw) : undefined };
}

export async function listEventShippingOptions(): Promise<ShippingOption[]> {
    const cartId = await getCartIdCookie();
    if (!cartId) return [];
    try {
        const json = await eventMedusaFetch<{ shipping_options: any[] }>(
            `/store/shipping-options`,
            { method: 'GET', query: { cart_id: cartId } },
        );
        return (json.shipping_options ?? []).map((o) => ({
            id: o.id,
            name: o.name,
            amount: num(o.amount ?? o.calculated_price?.calculated_amount),
        }));
    } catch {
        return [];
    }
}

export async function setEventShippingMethod(optionId: string): Promise<ActionResult<Cart>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    try {
        await eventMedusaFetch(`/store/carts/${cartId}/shipping-methods`, {
            method: 'POST',
            body: JSON.stringify({ option_id: optionId }),
        });
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not set shipping.' };
    }
    const raw = await fetchRawCart(cartId);
    return { ok: true, data: raw ? normalizeEventCart(raw) : undefined };
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
    try {
        const raw = await fetchRawCart(cartId);
        let collectionId: string | undefined = raw?.payment_collection?.id;

        if (!collectionId) {
            const { payment_collection } = await eventMedusaFetch<{ payment_collection: any }>(
                `/store/payment-collections`,
                { method: 'POST', body: JSON.stringify({ cart_id: cartId }) },
            );
            collectionId = payment_collection?.id;
        }
        if (!collectionId) return { ok: false, error: 'Could not start payment.' };

        const { payment_collection } = await eventMedusaFetch<{ payment_collection: any }>(
            `/store/payment-collections/${collectionId}/payment-sessions`,
            { method: 'POST', body: JSON.stringify({ provider_id: PROVIDER_ID }) },
        );

        const sessions = payment_collection?.payment_sessions ?? [];
        const stripeSession =
            sessions.find((s: any) => s.provider_id === PROVIDER_ID) ?? sessions[0];
        const clientSecret = stripeSession?.data?.client_secret;
        if (!clientSecret) {
            return { ok: false, error: 'Stripe did not return a client secret.' };
        }
        return { ok: true, data: { clientSecret: String(clientSecret) } };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not start payment.' };
    }
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
    try {
        const res = await eventMedusaFetch<any>(`/store/carts/${cartId}/complete`, {
            method: 'POST',
        });
        if (res?.type === 'order' && res.order?.id) {
            await clearCartIdCookie();
            return { ok: true, data: { orderId: res.order.id } };
        }
        return { ok: false, error: res?.error?.message || 'Order could not be completed.' };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Order could not be completed.' };
    }
}
