import 'server-only';

/**
 * Cookie-free cores for the event-package cart/checkout flow.
 *
 * This module intentionally has NO `'use server'` directive (unlike
 * event-cart.ts): every export here takes an explicit `EventAuthCtx` +
 * (where relevant) an explicit `cartId` instead of reading the
 * `rollout_event_cart_id` cookie or calling ensureMedusaCustomerToken()
 * itself, so it works from a plain server module (the mobile app's
 * /api/app/event-checkout/* routes) as well as from a 'use server' actions
 * file. A 'use server' file requires every export to be an async function
 * with serializable arguments — `EventAuthCtx.getAuthHeader` is a closure,
 * which is NOT serializable, so these cores could not live directly inside
 * event-cart.ts's exports without breaking that constraint.
 *
 * event-cart.ts's existing cookie-based server actions are thin wrappers
 * around these same functions (see its top-of-file doc comment) — the web
 * checkout's behaviour is unchanged; only where the shared logic LIVES moved.
 */
import { MEDUSA_URL, MEDUSA_REGION_ID } from './medusa';
import type {
    ActionResult,
    AddressInput,
    Cart,
    CartLine,
    EventCartMeta,
    ShippingOption,
} from './medusa-types';

export const PROVIDER_ID = process.env.MEDUSA_STRIPE_PROVIDER_ID || 'pp_stripe_stripe';

// Server-side-only Events channel credentials. NO in-code fallback: unset env
// → event checkout refuses loudly instead of leaking onto the public channel.
export const EVENTS_SALES_CHANNEL_ID = process.env.EVENTS_SALES_CHANNEL_ID || '';
export const EVENTS_MEDUSA_PUBLISHABLE_KEY = process.env.EVENTS_MEDUSA_PUBLISHABLE_KEY || '';

export const CART_FIELDS =
    '*items,*items.variant,*items.product,+items.total,+items.unit_price,+items.metadata,' +
    '*shipping_methods,*shipping_address,*payment_collection,+metadata,' +
    '*payment_collection.payment_sessions,+subtotal,+item_subtotal,+shipping_total,+tax_total,+total,+item_total';

export function eventsConfigured(): boolean {
    return Boolean(EVENTS_SALES_CHANNEL_ID && EVENTS_MEDUSA_PUBLISHABLE_KEY);
}

function eventMedusaHeaders(): Record<string, string> {
    return {
        'x-publishable-api-key': EVENTS_MEDUSA_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
    };
}

/**
 * How a caller supplies auth for event-cart requests. `getAuthHeader` is
 * called on every request (and again, once, on a 401 retry — so a relink
 * attempt can happen exactly like the web's eventAuthHeader() re-running
 * ensureMedusaCustomerToken() each time). `getUid` is best-effort, for the
 * 401 warning log only.
 */
export type EventAuthCtx = {
    getAuthHeader: () => Promise<Record<string, string>>;
    getUid?: () => Promise<string | null>;
};

// ── low-level fetch ──────────────────────────────────────────────────────────
/**
 * `_retryOn401` is internal — callers never pass it. It bounds the
 * relink-and-retry below to exactly one attempt so a still-broken identity
 * fails fast instead of looping.
 */
export async function eventMedusaFetchCore<T = any>(
    ctx: EventAuthCtx,
    path: string,
    init?: RequestInit & { query?: Record<string, string | string[]> },
    _retryOn401 = true,
): Promise<T> {
    const url = new URL(`${MEDUSA_URL}${path}`);
    if (init?.query) {
        for (const [k, v] of Object.entries(init.query)) {
            if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
            else url.searchParams.set(k, v);
        }
    }
    // The caller's token goes on EVERY event request: once the cart belongs to
    // a customer, an unauthenticated read of it 404s (measured at R12), so a
    // half-authenticated flow is worse than none.
    const auth = await ctx.getAuthHeader();
    const res = await fetch(url.toString(), {
        ...init,
        headers: { ...eventMedusaHeaders(), ...auth, ...(init?.headers || {}) },
        cache: 'no-store',
    });

    // A member-scoped call that comes back 401 can mean the Medusa auth
    // identity's link went stale between when getAuthHeader() fetched the
    // token and now (a dangling actor — see ensureMedusaCustomerTokenForUser
    // in medusa-customer.ts, which asks the backend's relink route to clear
    // it). Calling getAuthHeader() again IS the relink attempt (it re-runs the
    // full verify→relink→create→re-exchange sequence). Bounded to one retry
    // via _retryOn401 — this never loops.
    if (res.status === 401 && _retryOn401 && auth.Authorization) {
        const uid = ctx.getUid ? await ctx.getUid().catch(() => null) : null;
        console.warn(
            `[event-cart] 401 on ${path} for member ${uid ?? 'unknown'} — attempting one relink + retry (no token logged).`,
        );
        return eventMedusaFetchCore<T>(ctx, path, init, false);
    }

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

// ── normalization ───────────────────────────────────────────────────────────
export function num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** The event contract stamped on the cart at creation (null if missing). */
export function metaOf(raw: any): EventCartMeta | null {
    const m = (raw?.metadata ?? {}) as Record<string, any>;
    const eventId = typeof m.event_id === 'string' ? m.event_id : null;
    const tierId = typeof m.event_tier_id === 'string' ? m.event_tier_id : null;
    const profileId = typeof m.event_profile_id === 'string' ? m.event_profile_id : null;
    if (!eventId || !tierId || !profileId) return null;
    const ticketHoldId = typeof m.ticket_hold_id === 'string' ? m.ticket_hold_id : null;
    return { eventId, tierId, profileId, ticketHoldId };
}

/**
 * Same Cart shape the store checkout renders — vendor fields stay empty (an
 * event package belongs to the event, not a selling shop).
 */
export function normalizeEventCart(raw: any): Cart {
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
        // Event carts are pickup-only; no saved address to prefill.
        shippingAddress: null,
        hasShippingAddress: Boolean(raw.shipping_address?.address_1),
        shippingOptionId: raw.shipping_methods?.[0]?.shipping_option_id ?? null,
        vendor: { shopId: null, slug: null, name: null, handle: null },
        vendors: [],
        isMultiVendor: false,
    };
}

export async function fetchRawCartCore(ctx: EventAuthCtx, id: string): Promise<any | null> {
    try {
        const { cart } = await eventMedusaFetchCore<{ cart: any }>(ctx, `/store/carts/${id}`, {
            method: 'GET',
            query: { fields: CART_FIELDS },
        });
        return cart ?? null;
    } catch {
        return null;
    }
}

/**
 * The event cart at `cartId`, with the event contract it was stamped with.
 * Returns null when the cart is gone or the stamp is missing/corrupt —
 * callers use meta to verify ownership (event id + profile id match the
 * caller) before trusting anything else about the cart.
 */
export async function getEventCartCore(
    ctx: EventAuthCtx,
    cartId: string,
): Promise<{ cart: Cart; meta: EventCartMeta } | null> {
    if (!eventsConfigured()) return null;
    const raw = await fetchRawCartCore(ctx, cartId);
    if (!raw) return null;
    const meta = metaOf(raw);
    if (!meta) return null;
    return { cart: normalizeEventCart(raw), meta };
}

// ── cart creation ────────────────────────────────────────────────────────────
export type EventCartCoreResult =
    | { ok: true; cartId: string; staleCartId?: string | null }
    | { ok: false; error: string; staleCartId?: string | null };

/**
 * Create (or reuse) the one-package event cart for a reserved tier: Events
 * channel, contract metadata, the tier product's first variant × 1.
 *
 * `existingCartId` (a cookie for the web, or a client-supplied cart id for
 * the app — the app always starts fresh via /start, so it passes null) is
 * reused only when it matches the SAME event + tier and still has its line;
 * otherwise it comes back as `staleCartId` so the caller can discard it
 * (clear the cookie; the app has nothing to discard since it never persisted
 * that id anywhere of its own).
 */
export async function createEventPackageCartCore(
    ctx: EventAuthCtx,
    input: { eventId: string; tierId: string; profileId: string; medusaProductId: string },
    existingCartId: string | null,
): Promise<EventCartCoreResult> {
    if (!eventsConfigured()) {
        return { ok: false, error: 'Event checkout is not configured.' };
    }
    const { eventId, tierId, profileId, medusaProductId } = input;
    if (!eventId || !tierId || !profileId || !medusaProductId) {
        return { ok: false, error: 'Missing event package details.' };
    }

    // Refuse BEFORE any money moves. Without a Medusa customer the completion
    // gate rejects the order — and at R12 it did so only after Stripe had
    // captured. A member who cannot be identified must be turned away at the
    // door, not at the till.
    const authHeader = await ctx.getAuthHeader();
    if (!authHeader.Authorization) {
        return {
            ok: false,
            error: 'Sign in to reserve a paid spot — an event package is tied to your account.',
        };
    }

    let staleCartId: string | null = null;
    if (existingCartId) {
        const raw = await fetchRawCartCore(ctx, existingCartId);
        const meta = raw ? metaOf(raw) : null;
        if (
            meta &&
            meta.eventId === eventId &&
            meta.tierId === tierId &&
            meta.profileId === profileId &&
            Array.isArray(raw.items) &&
            raw.items.length > 0
        ) {
            return { ok: true, cartId: existingCartId };
        }
        staleCartId = existingCartId;
    }

    try {
        // The tier's Medusa product → first variant, quantity 1 (the contract).
        const { products } = await eventMedusaFetchCore<{ products: any[] }>(ctx, `/store/products`, {
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
            return { ok: false, error: 'This package is not available right now.', staleCartId };
        }

        const { cart } = await eventMedusaFetchCore<{ cart: any }>(ctx, `/store/carts`, {
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

        // Bind the customer explicitly rather than trusting the bearer alone,
        // then CHECK it. Reaching Stripe on a cart Medusa still considers a
        // guest is the R12 failure exactly: the charge captures and the order
        // is refused afterwards. Failing here costs the member a retry; failing
        // later costs them a charge and a refund.
        await eventMedusaFetchCore(ctx, `/store/carts/${cart.id}/customer`, { method: 'POST' });

        const bound = await fetchRawCartCore(ctx, cart.id);
        if (!bound?.customer_id) {
            return {
                ok: false,
                error: 'Could not tie this package to your account — sign in again and retry. Nothing has been charged.',
                staleCartId,
            };
        }

        await eventMedusaFetchCore(ctx, `/store/carts/${cart.id}/line-items`, {
            method: 'POST',
            body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
        });

        return { ok: true, cartId: cart.id, staleCartId };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not start event checkout.', staleCartId };
    }
}

/**
 * Multi-ticket packages (feature-gated). Same shape as
 * createEventPackageCartCore but the line quantity is N (one per reserved
 * seat) and the cart metadata additionally carries `ticket_hold_id`. Callers
 * MUST have already reserved the hold via reserveTickets() in
 * lib/event-tickets.ts — this function only ever wires up the cart, never
 * reserves spots itself.
 *
 * Reuses an existing cart only when it matches the SAME hold id (not just the
 * same event+tier — a member/session that abandons one hold and starts a
 * fresh one must never resume paying for the stale hold's line).
 */
export async function createEventTicketsCartCore(
    ctx: EventAuthCtx,
    input: {
        eventId: string;
        tierId: string;
        profileId: string;
        medusaProductId: string;
        holdId: string;
        quantity: number;
    },
    existingCartId: string | null,
): Promise<EventCartCoreResult> {
    if (!eventsConfigured()) {
        return { ok: false, error: 'Event checkout is not configured.' };
    }
    const { eventId, tierId, profileId, medusaProductId, holdId, quantity } = input;
    if (!eventId || !tierId || !profileId || !medusaProductId || !holdId || quantity < 1) {
        return { ok: false, error: 'Missing event ticket details.' };
    }

    const authHeader = await ctx.getAuthHeader();
    if (!authHeader.Authorization) {
        return {
            ok: false,
            error: 'Sign in to reserve tickets — an event package is tied to your account.',
        };
    }

    let staleCartId: string | null = null;
    if (existingCartId) {
        const raw = await fetchRawCartCore(ctx, existingCartId);
        const meta = raw ? metaOf(raw) : null;
        if (
            meta &&
            meta.eventId === eventId &&
            meta.tierId === tierId &&
            meta.profileId === profileId &&
            meta.ticketHoldId === holdId &&
            Array.isArray(raw.items) &&
            raw.items.length > 0
        ) {
            return { ok: true, cartId: existingCartId };
        }
        staleCartId = existingCartId;
    }

    try {
        const { products } = await eventMedusaFetchCore<{ products: any[] }>(ctx, `/store/products`, {
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
            return { ok: false, error: 'This package is not available right now.', staleCartId };
        }

        const { cart } = await eventMedusaFetchCore<{ cart: any }>(ctx, `/store/carts`, {
            method: 'POST',
            body: JSON.stringify({
                region_id: MEDUSA_REGION_ID,
                sales_channel_id: EVENTS_SALES_CHANNEL_ID,
                metadata: {
                    event_id: eventId,
                    event_tier_id: tierId,
                    event_profile_id: profileId,
                    ticket_hold_id: holdId,
                },
            }),
        });

        await eventMedusaFetchCore(ctx, `/store/carts/${cart.id}/customer`, { method: 'POST' });

        const bound = await fetchRawCartCore(ctx, cart.id);
        if (!bound?.customer_id) {
            return {
                ok: false,
                error: 'Could not tie these tickets to your account — sign in again and retry. Nothing has been charged.',
                staleCartId,
            };
        }

        await eventMedusaFetchCore(ctx, `/store/carts/${cart.id}/line-items`, {
            method: 'POST',
            body: JSON.stringify({ variant_id: variantId, quantity }),
        });

        return { ok: true, cartId: cart.id, staleCartId };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not start ticket checkout.', staleCartId };
    }
}

// ── checkout (same endpoints as the store flow, events key + explicit cartId) ──
export async function setEventCheckoutContactCore(
    ctx: EventAuthCtx,
    cartId: string,
    email: string,
    address: AddressInput,
): Promise<ActionResult<Cart>> {
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
        await eventMedusaFetchCore(ctx, `/store/carts/${cartId}`, {
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
    const raw = await fetchRawCartCore(ctx, cartId);
    return { ok: true, data: raw ? normalizeEventCart(raw) : undefined };
}

export async function listEventShippingOptionsCore(ctx: EventAuthCtx, cartId: string): Promise<ShippingOption[]> {
    try {
        const json = await eventMedusaFetchCore<{ shipping_options: any[] }>(ctx, `/store/shipping-options`, {
            method: 'GET',
            query: { cart_id: cartId },
        });
        // Event lane: pickup options only (flat, event-pickup profile).
        return (json.shipping_options ?? []).map((o) => ({
            id: o.id,
            name: o.name,
            amount: num(o.amount ?? o.calculated_price?.calculated_amount),
            profileId: (o.shipping_profile_id as string | null) ?? 'default',
            priceType: (o.price_type === 'calculated' ? 'calculated' : 'flat') as 'flat' | 'calculated',
            dataId: (o.data?.id as string | undefined) ?? null,
            dataTenant: (o.data?.tenant as string | undefined) ?? null,
        }));
    } catch {
        return [];
    }
}

export async function setEventShippingMethodCore(
    ctx: EventAuthCtx,
    cartId: string,
    optionId: string,
): Promise<ActionResult<Cart>> {
    try {
        await eventMedusaFetchCore(ctx, `/store/carts/${cartId}/shipping-methods`, {
            method: 'POST',
            body: JSON.stringify({ option_id: optionId }),
        });
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not set shipping.' };
    }
    const raw = await fetchRawCartCore(ctx, cartId);
    return { ok: true, data: raw ? normalizeEventCart(raw) : undefined };
}

/**
 * Initialize a Stripe payment session and return its client_secret for the
 * card element (web) / PaymentSheet (app). Creates the payment collection
 * first if needed.
 */
export async function initEventStripePaymentSessionCore(
    ctx: EventAuthCtx,
    cartId: string,
): Promise<ActionResult<{ clientSecret: string }>> {
    try {
        const raw = await fetchRawCartCore(ctx, cartId);
        let collectionId: string | undefined = raw?.payment_collection?.id;

        if (!collectionId) {
            const { payment_collection } = await eventMedusaFetchCore<{ payment_collection: any }>(
                ctx,
                `/store/payment-collections`,
                { method: 'POST', body: JSON.stringify({ cart_id: cartId }) },
            );
            collectionId = payment_collection?.id;
        }
        if (!collectionId) return { ok: false, error: 'Could not start payment.' };

        const { payment_collection } = await eventMedusaFetchCore<{ payment_collection: any }>(
            ctx,
            `/store/payment-collections/${collectionId}/payment-sessions`,
            { method: 'POST', body: JSON.stringify({ provider_id: PROVIDER_ID }) },
        );

        const sessions = payment_collection?.payment_sessions ?? [];
        const stripeSession = sessions.find((s: any) => s.provider_id === PROVIDER_ID) ?? sessions[0];
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
 * order.placed subscriber then flips the held RSVP to confirmed.
 */
export async function completeEventCartCore(
    ctx: EventAuthCtx,
    cartId: string,
): Promise<ActionResult<{ orderId: string }>> {
    try {
        const res = await eventMedusaFetchCore<any>(ctx, `/store/carts/${cartId}/complete`, {
            method: 'POST',
        });
        if (res?.type === 'order' && res.order?.id) {
            return { ok: true, data: { orderId: res.order.id } };
        }
        return { ok: false, error: res?.error?.message || 'Order could not be completed.' };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Order could not be completed.' };
    }
}
