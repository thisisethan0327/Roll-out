'use server';

/**
 * Rollout storefront cart + checkout — Medusa Store API server actions.
 *
 * Mirrors the sequence proven in the NeferStock storefront (apps/storefront
 * lib/data/cart.ts): create cart (region) -> line items -> address/email ->
 * shipping method -> Stripe payment session -> complete. All requests carry the
 * Rollout publishable key so orders attribute to the Rollout sales channel; the
 * Medusa `order.placed` subscriber stamps order.metadata.vendor from category
 * handles and sends the tenant-branded email.
 *
 * Invariants enforced here:
 *  - PAUSE GATE: a paused product (metadata.paused) can never be added, even by
 *    a hand-crafted request — the UI hides the control AND this re-checks.
 *  - LINE-LEVEL VENDOR ATTRIBUTION (P2A): every line carries its own vendor on
 *    `line.metadata.vendor` (the tenant key the vendor dashboards filter on) plus
 *    the owning shop for display. MIXED CARTS ARE ALLOWED — a customer may buy
 *    from several shops (and install add-ons) in one cart / one order. The cart
 *    metadata carries the PRIMARY (highest-value) shop for legacy single-vendor
 *    display, plus a `vendors` list and a `multi` flag.
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
    MEDUSA_URL,
    MEDUSA_REGION_ID,
    medusaHeaders,
    isPausedMeta,
} from './medusa';
import {
    getSellingShops,
    resolveVendorShop,
    resolveShopVendorKey,
} from './store-shops';
import { ensureMedusaCustomerToken } from './medusa-customer';
import type {
    ActionResult,
    AddressInput,
    Cart,
    CartLine,
    CartVendor,
    ShippingOption,
} from './medusa-types';

const CART_COOKIE = '_rollout_cart_id';
const PROVIDER_ID = process.env.MEDUSA_STRIPE_PROVIDER_ID || 'pp_stripe_stripe';

const CART_FIELDS =
    '*items,*items.variant,*items.product,+items.total,+items.unit_price,+items.metadata,' +
    '*shipping_methods,*shipping_address,*payment_collection,' +
    '*payment_collection.payment_sessions,+subtotal,+item_subtotal,+shipping_total,+tax_total,+total,+item_total';

// ── low-level fetch ─────────────────────────────────────────────────────────
async function medusaFetch<T = any>(
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
        headers: { ...medusaHeaders(), ...(init?.headers || {}) },
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
    return store.get(CART_COOKIE)?.value ?? null;
}
async function setCartIdCookie(id: string): Promise<void> {
    const store = await cookies();
    store.set(CART_COOKIE, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
    });
}
async function clearCartIdCookie(): Promise<void> {
    const store = await cookies();
    store.delete(CART_COOKIE);
}

// ── normalization ───────────────────────────────────────────────────────────
function num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function normalizeCart(raw: any): Cart {
    const items: CartLine[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => {
        const lm = (it.metadata ?? {}) as Record<string, any>;
        return {
            id: it.id,
            productTitle: it.product_title ?? it.title ?? 'Item',
            variantTitle: it.variant_title ?? it.variant?.title ?? null,
            productHandle: it.product_handle ?? it.product?.handle ?? null,
            thumbnail: it.thumbnail ?? it.product?.thumbnail ?? null,
            quantity: num(it.quantity),
            unitPrice: num(it.unit_price),
            total: num(it.total ?? it.unit_price * it.quantity),
            vendor: lm.vendor ?? null,
            shopName: lm.shop_name ?? null,
            shopHandle: lm.shop_handle ?? null,
        };
    });

    // Distinct owning shops across the cart's lines (by shop slug), and the
    // PRIMARY = the shop whose lines sum to the highest money value. Derived
    // purely from line metadata so it's always consistent with what was stamped.
    const shopOrder: string[] = [];
    const shopWeight = new Map<string, number>();
    const shopByKey = new Map<string, CartVendor>();
    for (const it of items) {
        const lm = (raw.items?.find((r: any) => r.id === it.id)?.metadata ?? {}) as Record<string, any>;
        const slug = lm.shop_slug ?? null;
        if (!slug) continue; // install / unattributed line — not a shop
        if (!shopWeight.has(slug)) {
            shopWeight.set(slug, 0);
            shopOrder.push(slug);
            shopByKey.set(slug, {
                shopId: lm.shop_id != null ? Number(lm.shop_id) : null,
                slug,
                name: lm.shop_name ?? null,
                handle: lm.shop_handle ?? null,
            });
        }
        shopWeight.set(slug, shopWeight.get(slug)! + it.total);
    }
    let primarySlug: string | null = shopOrder[0] ?? null;
    for (const s of shopOrder) {
        if (primarySlug == null || shopWeight.get(s)! > shopWeight.get(primarySlug)!) primarySlug = s;
    }
    const vendors: CartVendor[] = shopOrder.map((s) => shopByKey.get(s)!);
    const primary: CartVendor =
        (primarySlug && shopByKey.get(primarySlug)) || {
            shopId: null,
            slug: null,
            name: null,
            handle: null,
        };

    return {
        id: raw.id,
        email: raw.email ?? null,
        currencyCode: raw.currency_code ?? 'usd',
        items,
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        // items-only: Medusa's `subtotal` includes any shipping method already
        // attached to the cart (bit us on emails + order pages too)
        subtotal: num(raw.item_subtotal ?? raw.item_total ?? raw.subtotal),
        shippingTotal: num(raw.shipping_total),
        taxTotal: num(raw.tax_total),
        total: num(raw.total),
        hasShippingAddress: Boolean(raw.shipping_address?.address_1),
        shippingOptionId: raw.shipping_methods?.[0]?.shipping_option_id ?? null,
        vendor: primary,
        vendors,
        isMultiVendor: vendors.length > 1,
    };
}

async function fetchRawCart(id: string): Promise<any | null> {
    try {
        const { cart } = await medusaFetch<{ cart: any }>(`/store/carts/${id}`, {
            method: 'GET',
            query: { fields: CART_FIELDS },
        });
        return cart ?? null;
    } catch {
        return null;
    }
}

// ── public reads ────────────────────────────────────────────────────────────
export async function getCart(): Promise<Cart | null> {
    const id = await getCartIdCookie();
    if (!id) return null;
    const raw = await fetchRawCart(id);
    return raw ? normalizeCart(raw) : null;
}

export async function getCartCount(): Promise<number> {
    const cart = await getCart();
    return cart?.itemCount ?? 0;
}

// ── vendor resolution for a variant ─────────────────────────────────────────
type VariantOwner = {
    paused: boolean;
    categoryHandles: string[];
    productHandle: string | null;
};
async function resolveVariantOwner(variantId: string): Promise<VariantOwner | null> {
    try {
        const json = await medusaFetch<{ products: any[] }>(`/store/products`, {
            method: 'GET',
            query: {
                'variants.id[]': [variantId],
                fields: 'id,handle,+metadata,categories.handle',
                limit: '1',
            },
        });
        const p = json?.products?.[0];
        if (!p) return null;
        return {
            paused: isPausedMeta(p.metadata),
            categoryHandles: (p.categories ?? []).map((c: any) => c.handle).filter(Boolean),
            productHandle: p.handle ?? null,
        };
    } catch {
        return null;
    }
}

// ── cart mutations ──────────────────────────────────────────────────────────
async function ensureCartId(): Promise<string> {
    const existing = await getCartIdCookie();
    if (existing) {
        const raw = await fetchRawCart(existing);
        if (raw) return existing;
    }
    const { cart } = await medusaFetch<{ cart: any }>(`/store/carts`, {
        method: 'POST',
        body: JSON.stringify({ region_id: MEDUSA_REGION_ID }),
    });
    await setCartIdCookie(cart.id);
    return cart.id;
}

export async function addToCart(
    variantId: string,
    quantity = 1,
): Promise<ActionResult<Cart>> {
    if (!variantId) return { ok: false, error: 'Missing variant.' };

    // Resolve the owning product: enforces the pause gate and resolves the line's
    // vendor. Mixed carts are allowed — no single-vendor rejection.
    const owner = await resolveVariantOwner(variantId);
    if (owner?.paused) {
        return { ok: false, error: 'This product is coming soon and can’t be purchased yet.' };
    }

    // Line-level attribution: the tenant vendor KEY (what vendor dashboards
    // filter on) plus the owning shop for per-line display. Category-less lines
    // (install add-ons) resolve to null and are bridged to appointments on the
    // backend at order.placed — they carry no vendor here.
    const shops = await getSellingShops();
    const vendorShop = owner ? resolveVendorShop(owner.categoryHandles, shops) : null;
    const vendorKey = owner ? resolveShopVendorKey({ categoryHandles: owner.categoryHandles }) : null;
    const lineMetadata: Record<string, unknown> = {
        vendor: vendorKey,
        shop_id: vendorShop?.shopId ?? null,
        shop_slug: vendorShop?.slug ?? null,
        shop_name: vendorShop?.name ?? null,
        shop_handle: vendorShop?.handle ?? null,
    };

    const cartId = await ensureCartId();

    try {
        await medusaFetch(`/store/carts/${cartId}/line-items`, {
            method: 'POST',
            body: JSON.stringify({ variant_id: variantId, quantity, metadata: lineMetadata }),
        });
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not add to cart.' };
    }

    revalidatePath('/store/cart');
    const updated = await fetchRawCart(cartId);
    return { ok: true, data: updated ? normalizeCart(updated) : undefined };
}

export async function updateLineItem(
    lineId: string,
    quantity: number,
): Promise<ActionResult<Cart>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    try {
        if (quantity <= 0) {
            await medusaFetch(`/store/carts/${cartId}/line-items/${lineId}`, {
                method: 'DELETE',
            });
        } else {
            await medusaFetch(`/store/carts/${cartId}/line-items/${lineId}`, {
                method: 'POST',
                body: JSON.stringify({ quantity }),
            });
        }
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update item.' };
    }
    // Vendor attribution now lives on each LINE's metadata (see addToCart), so
    // an empty cart needs no vendor-lock teardown — there is nothing to clear.
    revalidatePath('/store/cart');
    const fresh = await fetchRawCart(cartId);
    return { ok: true, data: fresh ? normalizeCart(fresh) : undefined };
}

export async function removeLineItem(lineId: string): Promise<ActionResult<Cart>> {
    return updateLineItem(lineId, 0);
}

// ── checkout ────────────────────────────────────────────────────────────────
export async function setCheckoutContact(
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
        await medusaFetch(`/store/carts/${cartId}`, {
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
    return { ok: true, data: raw ? normalizeCart(raw) : undefined };
}

export async function listShippingOptions(): Promise<ShippingOption[]> {
    const cartId = await getCartIdCookie();
    if (!cartId) return [];
    try {
        const json = await medusaFetch<{ shipping_options: any[] }>(
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

export async function setShippingMethod(optionId: string): Promise<ActionResult<Cart>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    try {
        await medusaFetch(`/store/carts/${cartId}/shipping-methods`, {
            method: 'POST',
            body: JSON.stringify({ option_id: optionId }),
        });
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not set shipping.' };
    }
    const raw = await fetchRawCart(cartId);
    return { ok: true, data: raw ? normalizeCart(raw) : undefined };
}

/**
 * Initialize a Stripe payment session and return its client_secret for the
 * browser Payment/Card element. Creates the payment collection first if the
 * cart doesn't have one yet.
 */
export async function initStripePaymentSession(): Promise<ActionResult<{ clientSecret: string }>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    try {
        const raw = await fetchRawCart(cartId);
        let collectionId: string | undefined = raw?.payment_collection?.id;

        if (!collectionId) {
            const { payment_collection } = await medusaFetch<{ payment_collection: any }>(
                `/store/payment-collections`,
                { method: 'POST', body: JSON.stringify({ cart_id: cartId }) },
            );
            collectionId = payment_collection?.id;
        }
        if (!collectionId) return { ok: false, error: 'Could not start payment.' };

        const { payment_collection } = await medusaFetch<{ payment_collection: any }>(
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
 * Best-effort: link the cart to the signed-in platform user's Medusa customer
 * so the completed order carries customer_id and surfaces in /me/orders.
 *
 * - Anonymous checkout is unchanged: no session ⇒ ensureMedusaCustomerToken()
 *   returns null and we leave the cart email-only.
 * - Never throws and never blocks completion: a failed linkage falls through to
 *   an anonymous order rather than losing the sale.
 */
async function linkCartToSignedInCustomer(cartId: string): Promise<void> {
    try {
        const token = await ensureMedusaCustomerToken();
        if (!token) return;
        // POST /store/carts/{id}/customer — transfers the cart to the customer
        // resolved from the Bearer token (mirrors sdk.store.cart.transferCart).
        await medusaFetch(`/store/carts/${cartId}/customer`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch {
        // Swallow: linkage is a best-effort enhancement, not a checkout gate.
    }
}

/** Complete the cart into an order after Stripe confirms the payment. */
export async function completeCart(): Promise<ActionResult<{ orderId: string }>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
    // Associate the cart with the signed-in customer before completion so the
    // order is attributed to their identity. Best-effort — see helper.
    await linkCartToSignedInCustomer(cartId);
    try {
        const res = await medusaFetch<any>(`/store/carts/${cartId}/complete`, {
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
