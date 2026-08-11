/**
 * Read-only Medusa Store API client for rendering shop catalogs and product
 * detail on Rollout, plus the shared constants/types the cart + checkout server
 * actions build on. The publishable key attributes every read/write to the
 * Rollout sales channel. It is a PUBLIC key (safe to ship) — the in-code
 * fallback lets the catalog render even before the Coolify env var is set.
 */
import 'server-only';
import type {
    MedusaProduct,
    MedusaVariant,
    MedusaProductDetail,
} from './medusa-types';

export type { MedusaProduct, MedusaVariant, MedusaProductDetail } from './medusa-types';
export { formatMoney, formatMedusaPrice } from './medusa-types';

export const MEDUSA_URL =
    process.env.NEXT_PUBLIC_MEDUSA_URL || 'https://api.neferstock.com';

// PUBLIC publishable key for the Rollout storefront sales channel. Safe to ship.
const FALLBACK_PUBLISHABLE_KEY =
    'pk_9dc381390dd5fa8494d5f4f7d0607b2963579e773336a0404f790c4c1a850645';

export const MEDUSA_PUBLISHABLE_KEY =
    process.env.ROLLOUT_MEDUSA_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

// The only region configured in Medusa today — the US region shared by every
// surface. Carts are created against it so prices + shipping resolve.
export const MEDUSA_REGION_ID =
    process.env.NEXT_PUBLIC_MEDUSA_REGION_ID || 'reg_01KYWZ12TVM8AAHFZ52FPZCD0Y';

// Client-safe Stripe TEST publishable key (Elements needs it in the browser).
// A publishable test key is safe to ship; the secret key stays server-side in
// Medusa. Prefer the env var; fall back to the known test key from the creds.
export const STRIPE_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_STRIPE_KEY ||
    'pk_test_51U3MFoEXiz5SDbA84AS0Ie4H6DdQD3OrAtwQl88JT9RFjtyq53vEIlFqFOmwUAAySnvWk3ElNeKfG1M22QGSdcft002dK3kREL';

export function medusaHeaders(): Record<string, string> {
    return {
        'x-publishable-api-key': MEDUSA_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
    };
}

/**
 * PAUSED = on the shelf but not purchasable. NeferStock's coming-soon gate sets
 * `metadata.paused = "true"` (see Neferstock backend set-paused.mjs). Mirror the
 * storefront's tolerant read so the flag is honoured however it was written.
 */
export function isPausedMeta(metadata: unknown): boolean {
    const v = (metadata as Record<string, unknown> | null | undefined)?.paused;
    return v === true || v === 'true' || v === 1 || v === '1';
}

function extractPrice(p: any): { price: number | null; currency: string | null } {
    const variants = Array.isArray(p?.variants) ? p.variants : [];
    let best: number | null = null;
    let currency: string | null = null;
    for (const v of variants) {
        const cp = v?.calculated_price;
        const amount =
            cp?.calculated_amount ?? cp?.amount ?? v?.prices?.[0]?.amount ?? null;
        if (amount != null && !Number.isNaN(Number(amount))) {
            const n = Number(amount);
            if (best == null || n < best) {
                best = n;
                currency = cp?.currency_code ?? v?.prices?.[0]?.currency_code ?? null;
            }
        }
    }
    return { price: best, currency };
}

function variantPrice(v: any): { price: number | null; currency: string | null } {
    const cp = v?.calculated_price;
    const amount = cp?.calculated_amount ?? cp?.amount ?? v?.prices?.[0]?.amount ?? null;
    if (amount == null || Number.isNaN(Number(amount))) return { price: null, currency: null };
    return {
        price: Number(amount),
        currency: cp?.currency_code ?? v?.prices?.[0]?.currency_code ?? 'usd',
    };
}

function categoryHandlesOf(p: any): string[] {
    return (Array.isArray(p?.categories) ? p.categories : [])
        .map((c: any) => c?.handle)
        .filter(Boolean);
}

function mapProduct(p: any): MedusaProduct {
    const { price, currency } = extractPrice(p);
    return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        thumbnail: p.thumbnail ?? null,
        description: p.description ?? null,
        price,
        currency,
        paused: isPausedMeta(p.metadata),
        categoryHandles: categoryHandlesOf(p),
    };
}

/**
 * Resolve a shop's registry handles to Medusa category ids — matching the
 * parent category AND its children (handle === h OR handle starts with `h-`).
 * Medusa's category_id filter is NOT recursive, so a shop whose products live
 * only in child categories (e.g. divine: products sit in `divine-wheel-builds`,
 * registry handle is `divine`) would otherwise return an empty catalog.
 */
async function resolveCategoryIds(handles: string[]): Promise<string[]> {
    const ids = new Set<string>();
    try {
        const url = new URL(`${MEDUSA_URL}/store/product-categories`);
        url.searchParams.set('limit', '200');
        url.searchParams.set('fields', 'id,handle');
        const res = await fetch(url.toString(), {
            headers: medusaHeaders(),
            next: { revalidate: 300 },
        });
        if (res.ok) {
            const json = await res.json();
            for (const cat of json?.product_categories ?? []) {
                const ch: string | undefined = cat?.handle;
                if (!ch || !cat?.id) continue;
                if (handles.some((h) => ch === h || ch.startsWith(h + '-'))) {
                    ids.add(cat.id);
                }
            }
        }
    } catch {
        /* best-effort — empty catalog is handled by the caller */
    }
    return [...ids];
}

/**
 * Fetch published products for a shop's Medusa category handles. Returns [] on
 * any error (surfaced as an empty catalog with an explanatory note). Passing
 * region_id makes calculated_price resolve so cards can show a price.
 */
export async function fetchCatalogByHandles(
    handles: string[],
): Promise<{ products: MedusaProduct[]; error: string | null }> {
    if (!handles || handles.length === 0) return { products: [], error: null };
    try {
        const categoryIds = await resolveCategoryIds(handles);
        if (categoryIds.length === 0) return { products: [], error: null };
        const url = new URL(`${MEDUSA_URL}/store/products`);
        url.searchParams.set('limit', '100');
        url.searchParams.set('region_id', MEDUSA_REGION_ID);
        url.searchParams.set(
            'fields',
            'id,title,handle,thumbnail,description,+metadata,categories.handle,*variants,*variants.calculated_price',
        );
        for (const cid of categoryIds) url.searchParams.append('category_id[]', cid);

        const res = await fetch(url.toString(), {
            headers: medusaHeaders(),
            next: { revalidate: 300 },
        });
        if (!res.ok) {
            return { products: [], error: `Medusa responded ${res.status}` };
        }
        const json = await res.json();
        // Dedup: a product in two of the shop's categories comes back twice.
        const seen = new Set<string>();
        const products: MedusaProduct[] = [];
        for (const raw of json?.products ?? []) {
            if (seen.has(raw.id)) continue;
            seen.add(raw.id);
            products.push(mapProduct(raw));
        }
        return { products, error: null };
    } catch (e: any) {
        return { products: [], error: e?.message ?? 'Catalog fetch failed' };
    }
}

/** Full product detail (gallery, options, variants) for the PDP. */
export async function fetchProductByHandle(
    handle: string,
): Promise<MedusaProductDetail | null> {
    try {
        const url = new URL(`${MEDUSA_URL}/store/products`);
        url.searchParams.set('handle', handle);
        url.searchParams.set('limit', '1');
        url.searchParams.set('region_id', MEDUSA_REGION_ID);
        url.searchParams.set(
            'fields',
            'id,title,handle,description,thumbnail,+metadata,*images,*categories,*options,*options.values,*variants,*variants.options,*variants.calculated_price,*variants.inventory_quantity',
        );
        const res = await fetch(url.toString(), {
            headers: medusaHeaders(),
            next: { revalidate: 120 },
        });
        if (!res.ok) return null;
        const json = await res.json();
        const p = json?.products?.[0];
        if (!p) return null;

        const base = mapProduct(p);
        const images: string[] = (Array.isArray(p.images) ? p.images : [])
            .map((i: any) => i?.url)
            .filter(Boolean);
        if (base.thumbnail && !images.includes(base.thumbnail)) images.unshift(base.thumbnail);

        const options = (Array.isArray(p.options) ? p.options : []).map((o: any) => ({
            title: o.title,
            values: Array.from(
                new Set((o.values ?? []).map((v: any) => v.value).filter(Boolean)),
            ) as string[],
        }));

        const variants: MedusaVariant[] = (Array.isArray(p.variants) ? p.variants : []).map(
            (v: any) => {
                const { price, currency } = variantPrice(v);
                const optionValues: Record<string, string> = {};
                for (const ov of v.options ?? []) {
                    const title = ov?.option?.title;
                    if (title) optionValues[title] = ov.value;
                }
                const qty = v?.inventory_quantity;
                return {
                    id: v.id,
                    title: v.title ?? null,
                    price,
                    currency,
                    optionValues,
                    // Treat unknown inventory as in stock (services/made-to-order
                    // variants often don't track quantity).
                    inStock: qty == null ? true : Number(qty) > 0,
                };
            },
        );

        return { ...base, images, options, variants };
    } catch {
        return null;
    }
}
