/**
 * Shared, side-effect-free types + formatters for the Rollout storefront.
 * Imported by BOTH server actions/components and client components, so this
 * module must stay free of `server-only` and any runtime imports.
 */

// ── Catalog types (also re-exported from lib/medusa for server code) ────────
export type MedusaProduct = {
    id: string;
    title: string;
    handle: string;
    thumbnail: string | null;
    description: string | null;
    price: number | null;
    currency: string | null;
    paused: boolean;
    categoryHandles: string[];
};

export type MedusaVariant = {
    id: string;
    title: string | null;
    price: number | null;
    currency: string | null;
    optionValues: Record<string, string>;
    inStock: boolean;
};

export type MedusaProductDetail = MedusaProduct & {
    images: string[];
    options: { title: string; values: string[] }[];
    variants: MedusaVariant[];
};

export function formatMoney(amount: number | null, currency?: string | null): string {
    if (amount == null) return '—';
    const cur = (currency ?? 'usd').toUpperCase();
    return `${cur === 'USD' ? '$' : cur + ' '}${amount.toFixed(2)}`;
}

export function formatMedusaPrice(p: { price: number | null; currency: string | null }): string {
    return formatMoney(p.price, p.currency);
}

// ── Cart / checkout types ───────────────────────────────────────────────────
export type CartLine = {
    id: string;
    productTitle: string;
    variantTitle: string | null;
    productHandle: string | null;
    thumbnail: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
};

export type CartVendor = {
    shopId: number | null;
    slug: string | null;
    name: string | null;
    handle: string | null;
};

export type Cart = {
    id: string;
    email: string | null;
    currencyCode: string;
    items: CartLine[];
    itemCount: number;
    subtotal: number;
    shippingTotal: number;
    taxTotal: number;
    total: number;
    hasShippingAddress: boolean;
    shippingOptionId: string | null;
    vendor: CartVendor;
};

export type ShippingOption = {
    id: string;
    name: string;
    amount: number;
};

export type AddressInput = {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
    phone?: string;
};

export type ActionResult<T = undefined> =
    | { ok: true; data?: T }
    | { ok: false; error: string };
