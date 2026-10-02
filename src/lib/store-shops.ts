/**
 * Selling-shop registry helpers for the Rollout storefront.
 *
 * The tenant registry (rollout.shops) is the single source of truth for which
 * shops sell products and which Medusa category handles are theirs. Vendor
 * attribution on Rollout resolves a product -> owning shop by matching the
 * product's category handles against each shop's `medusa_category_handles`
 * (exact OR `<handle>-` prefix, so `nac-tees` maps to the `nac` shop and every
 * `divine-*` category maps to the `divine` shop).
 *
 * Server-only: reads via the service-role admin client (public registry data,
 * no per-user gate needed — the same rows power the public /shops directory).
 */
import 'server-only';
import { getSupabaseAdmin } from './supabase/admin';

export type SellingShop = {
    shopId: number;
    slug: string;
    name: string;
    /** Profile @handle for /u/[handle] link-back (falls back to slug). */
    handle: string;
    categoryHandles: string[];
    tier: number;
    primaryColor: string | null;
    /** The business's own website (shops.website_url), when the registry has one. */
    websiteUrl: string | null;
};

let cache: { at: number; shops: SellingShop[] } | null = null;
const TTL = 60_000;

export async function getSellingShops(): Promise<SellingShop[]> {
    if (cache && Date.now() - cache.at < TTL) return cache.shops;

    const admin = getSupabaseAdmin();
    const { data: shopsRaw, error: shopsError } = await admin
        .from('shops')
        .select('id, slug, name, commerce_tier, medusa_category_handles, primary_color, website_url')
        .eq('sells_products', true)
        // Gate the storefront on BOTH listing verification and commerce clearance:
        // a shop only sells publicly once it is listed (status=verified) and its
        // commerce KYC is at least docs_verified (interim-selling tier).
        .eq('status', 'verified')
        .in('commerce_status', ['docs_verified', 'verified'])
        .order('commerce_tier', { ascending: true });
    if (shopsError) console.error('[lib/store-shops] getSellingShops failed:', shopsError.message);

    const rows = (shopsRaw as any[]) ?? [];
    if (rows.length === 0) {
        cache = { at: Date.now(), shops: [] };
        return [];
    }

    const ids = rows.map((s) => s.id);
    const { data: pagesRaw, error: pagesError } = await admin
        .from('profiles')
        .select('shop_id, handle')
        .eq('kind', 'shop_page')
        .in('shop_id', ids);
    if (pagesError) console.error('[lib/store-shops] getSellingShops pages failed:', pagesError.message);

    const handleByShop = new Map<number, string>();
    for (const p of (pagesRaw as any[]) ?? []) handleByShop.set(p.shop_id, p.handle);

    const shops: SellingShop[] = rows.map((s) => ({
        shopId: s.id,
        slug: s.slug,
        name: s.name ?? s.slug,
        handle: handleByShop.get(s.id) ?? s.slug,
        categoryHandles: Array.isArray(s.medusa_category_handles)
            ? s.medusa_category_handles
            : [],
        tier: Number(s.commerce_tier ?? 1),
        primaryColor: s.primary_color ?? null,
        websiteUrl: typeof s.website_url === 'string' && /^https?:\/\//i.test(s.website_url.trim()) ? s.website_url.trim() : null,
    }));

    cache = { at: Date.now(), shops };
    return shops;
}

/** True when a product category handle belongs to a shop registry handle. */
function handleMatches(categoryHandle: string, registryHandle: string): boolean {
    return categoryHandle === registryHandle || categoryHandle.startsWith(registryHandle + '-');
}

/**
 * Resolve which selling shop owns a product from its category handles. Returns
 * null when no shop claims it (unattributed — should not happen for seeded
 * catalog, but the caller must handle it).
 */
export function resolveVendorShop(
    categoryHandles: string[],
    shops: SellingShop[],
): SellingShop | null {
    for (const shop of shops) {
        for (const ch of categoryHandles) {
            if (shop.categoryHandles.some((rh) => handleMatches(ch, rh))) {
                return shop;
            }
        }
    }
    return null;
}

export async function getSellingShopBySlug(slug: string): Promise<SellingShop | null> {
    const shops = await getSellingShops();
    return shops.find((s) => s.slug === slug || s.handle === slug) ?? null;
}

/**
 * Vendor category roots — mirrors the Medusa backend tenant registry
 * (Neferstock apps/backend/src/modules/tenant-registry/static-registry.ts). The
 * `order.placed` subscriber stamps `order.metadata.vendor` with the tenant SLUG
 * resolved from these same roots (via resolveProductVendor). A shop's "vendor
 * key" MUST be derived identically so the dashboard's vendor filter lines up
 * with what is written on the order. KEEP IN SYNC with that registry: a shop
 * whose Medusa category handles fall under one of these root sets is that
 * vendor; a shop with no catalog (e.g. EMWRAPS, empty handles) has NO vendor key
 * and therefore gets no Orders section.
 */
const VENDOR_CATEGORY_ROOTS: Record<string, string[]> = {
    neferstock: ['nac', 'house', 'tees', 'accessories'],
    divine: ['divine'],
    // UNITY USA (PPF brand, own tenant + Stripe connected account): consumer goods
    // (printable + pre-cut kits) are cross-listed in the rollout channel; the
    // dealer-only film never is. Same root as the backend registry.
    unityusa: ['unityusa'],
    // emwraps: no Medusa catalog yet → intentionally absent (no vendor key).
};

/**
 * Resolve a selling shop to the vendor slug stamped on its Medusa orders, or
 * null when the shop has no Medusa catalog. Read-only, pure (no I/O).
 */
export function resolveShopVendorKey(
    shop: Pick<SellingShop, 'categoryHandles'>,
): string | null {
    const handles = shop.categoryHandles ?? [];
    if (handles.length === 0) return null;
    for (const [vendor, roots] of Object.entries(VENDOR_CATEGORY_ROOTS)) {
        if (handles.some((ch) => roots.some((rh) => handleMatches(ch, rh)))) {
            return vendor;
        }
    }
    return null;
}

/**
 * Where each vendor's products OFFICIALLY live. Rollout's /store is a
 * marketplace: like a listing on Amazon, its product pages stand on their own
 * (self-canonical, indexable) but credit the real seller and point at the
 * maker's own page (owner decision 2026-10-01). NeferStock sells its own lines
 * and its tenants' (divine DESIGN WHEELS) on neferstock.com; UNITY USA sells on
 * unityusa.co. Each storefront serves a product at /us/products/<handle>,
 * the same handle it carries here (checked live 2026-10-01: all 77 listings
 * then on Rollout answered 200 at these URLs; configuratorUrl in lib/medusa
 * already sends UNITY kits there).
 * Keyed by the vendor key above — a vendor without an entry gets no link.
 */
const OFFICIAL_STOREFRONTS: Record<string, { label: string; site: string; productBase: string }> = {
    neferstock: { label: 'neferstock.com', site: 'https://neferstock.com', productBase: 'https://neferstock.com/us/products/' },
    divine: { label: 'neferstock.com', site: 'https://neferstock.com/us/divine', productBase: 'https://neferstock.com/us/products/' },
    unityusa: { label: 'unityusa.co', site: 'https://unityusa.co', productBase: 'https://unityusa.co/us/products/' },
};

export type OfficialListing = {
    /** The product's own page on the seller's site, when the vendor has a known storefront. */
    productUrl: string | null;
    /** The seller's site: its registry website, else its storefront. */
    siteUrl: string | null;
    /** Short host label for link text ("neferstock.com"). */
    label: string | null;
};

/** The official page for a product sold on Rollout by `shop`. Pure. */
export function officialListing(shop: SellingShop, productHandle: string | null | undefined): OfficialListing {
    const vendorKey = resolveShopVendorKey(shop);
    const store = vendorKey ? OFFICIAL_STOREFRONTS[vendorKey] : undefined;
    const siteUrl = shop.websiteUrl ?? store?.site ?? null;
    let label = store?.label ?? null;
    if (!label && siteUrl) {
        try {
            label = new URL(siteUrl).hostname.replace(/^www\./, '');
        } catch {
            label = null;
        }
    }
    return {
        productUrl: store && productHandle ? `${store.productBase}${encodeURIComponent(productHandle)}` : null,
        siteUrl,
        label,
    };
}

/**
 * Slug → { shop, vendorKey } for the Orders section. Returns null when the slug
 * is not a selling shop OR the shop has no vendor key (Orders unavailable).
 */
export async function getShopVendorBySlug(
    slug: string,
): Promise<{ shop: SellingShop; vendorKey: string } | null> {
    const shop = await getSellingShopBySlug(slug);
    if (!shop) return null;
    const vendorKey = resolveShopVendorKey(shop);
    if (!vendorKey) return null;
    return { shop, vendorKey };
}
