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
};

let cache: { at: number; shops: SellingShop[] } | null = null;
const TTL = 60_000;

export async function getSellingShops(): Promise<SellingShop[]> {
    if (cache && Date.now() - cache.at < TTL) return cache.shops;

    const admin = getSupabaseAdmin();
    const { data: shopsRaw } = await admin
        .from('shops')
        .select('id, slug, name, commerce_tier, medusa_category_handles, primary_color')
        .eq('sells_products', true)
        .order('commerce_tier', { ascending: true });

    const rows = (shopsRaw as any[]) ?? [];
    if (rows.length === 0) {
        cache = { at: Date.now(), shops: [] };
        return [];
    }

    const ids = rows.map((s) => s.id);
    const { data: pagesRaw } = await admin
        .from('profiles')
        .select('shop_id, handle')
        .eq('kind', 'shop_page')
        .in('shop_id', ids);

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
