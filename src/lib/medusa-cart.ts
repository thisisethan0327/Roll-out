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
 * Two invariants enforced here:
 *  - PAUSE GATE: a paused product (metadata.paused) can never be added, even by
 *    a hand-crafted request — the UI hides the control AND this re-checks.
 *  - SINGLE-VENDOR CART: one shop per order. The first add stamps the cart's
 *    vendor into cart.metadata; a later add from a different shop is rejected.
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
    MEDUSA_URL,
    MEDUSA_REGION_ID,
    medusaHeaders,
    isPausedMeta,
} from './medusa';
import { getSellingShops, resolveVendorShop } from './store-shops';
import type {
    ActionResult,
    AddressInput,
    Cart,
    CartLine,
    ShippingOption,
} from './medusa-types';

const CART_COOKIE = '_rollout_cart_id';
const PROVIDER_ID = process.env.MEDUSA_STRIPE_PROVIDER_ID || 'pp_stripe_stripe';

const CART_FIELDS =
    '*items,*items.variant,*items.product,+items.total,+items.unit_price,' +
    '*shipping_methods,*shipping_address,*payment_collection,' +
    '*payment_collection.payment_sessions,+subtotal,+shipping_total,+tax_total,+total,+item_total';

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
    const items: CartLine[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
        id: it.id,
        productTitle: it.product_title ?? it.title ?? 'Item',
        variantTitle: it.variant_title ?? it.variant?.title ?? null,
        productHandle: it.product_handle ?? it.product?.handle ?? null,
        thumbnail: it.thumbnail ?? it.product?.thumbnail ?? null,
        quantity: num(it.quantity),
        unitPrice: num(it.unit_price),
        total: num(it.total ?? it.unit_price * it.quantity),
    }));
    const meta = raw?.metadata ?? {};
    return {
        id: raw.id,
        email: raw.email ?? null,
        currencyCode: raw.currency_code ?? 'usd',
        items,
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        subtotal: num(raw.subtotal ?? raw.item_total),
        shippingTotal: num(raw.shipping_total),
        taxTotal: num(raw.tax_total),
        total: num(raw.total),
        hasShippingAddress: Boolean(raw.shipping_address?.address_1),
        shippingOptionId: raw.shipping_methods?.[0]?.shipping_option_id ?? null,
        vendor: {
            shopId: meta.vendor_shop_id != null ? Number(meta.vendor_shop_id) : null,
            slug: meta.vendor_slug ?? null,
            name: meta.vendor_name ?? null,
            handle: meta.vendor_handle ?? null,
        },
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

    // Resolve the owning product: enforces the pause gate AND single-vendor lock.
    const owner = await resolveVariantOwner(variantId);
    if (owner?.paused) {
        return { ok: false, error: 'This product is coming soon and can’t be purchased yet.' };
    }

    const shops = await getSellingShops();
    const vendor = owner ? resolveVendorShop(owner.categoryHandles, shops) : null;

    const cartId = await ensureCartId();
    const raw = await fetchRawCart(cartId);
    const existingVendorId = raw?.metadata?.vendor_shop_id
        ? Number(raw.metadata.vendor_shop_id)
        : null;

    if (
        existingVendorId != null &&
        vendor != null &&
        existingVendorId !== vendor.shopId &&
        (raw?.items?.length ?? 0) > 0
    ) {
        const existingName = raw?.metadata?.vendor_name || 'another shop';
        return {
            ok: false,
            error: `One shop per order. Your cart already has items from ${existingName}. Check out or empty it before adding from a different shop.`,
        };
    }

    try {
        await medusaFetch(`/store/carts/${cartId}/line-items`, {
            method: 'POST',
            body: JSON.stringify({ variant_id: variantId, quantity }),
        });

        // Stamp the vendor onto the cart on first add so attribution + the
        // single-vendor guard survive across requests.
        if (existingVendorId == null && vendor) {
            await medusaFetch(`/store/carts/${cartId}`, {
                method: 'POST',
                body: JSON.stringify({
                    metadata: {
                        vendor_shop_id: String(vendor.shopId),
                        vendor_slug: vendor.slug,
                        vendor_name: vendor.name,
                        vendor_handle: vendor.handle,
                    },
                }),
            });
        }
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
    const raw = await fetchRawCart(cartId);
    // Clear the vendor lock once the cart is empty so the shopper can start over.
    if (raw && (raw.items?.length ?? 0) === 0 && raw.metadata?.vendor_shop_id) {
        await medusaFetch(`/store/carts/${cartId}`, {
            method: 'POST',
            body: JSON.stringify({
                metadata: {
                    vendor_shop_id: null,
                    vendor_slug: null,
                    vendor_name: null,
                    vendor_handle: null,
                },
            }),
        }).catch(() => {});
    }
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

/** Complete the cart into an order after Stripe confirms the payment. */
export async function completeCart(): Promise<ActionResult<{ orderId: string }>> {
    const cartId = await getCartIdCookie();
    if (!cartId) return { ok: false, error: 'No cart.' };
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
