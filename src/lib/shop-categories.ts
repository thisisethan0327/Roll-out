/**
 * Platform-defined shop taxonomy — the single controlled vocabulary for a
 * shop's headline category, used everywhere a shop picks or is assigned one
 * (apply flow, admin shop-profile editor). Enforcement is intentionally
 * app-level only (this module + server-action validation): there is NO DB
 * constraint, so the taxonomy can evolve without a migration. Keep the values
 * and order stable — they are the option list users see.
 */
export const SHOP_CATEGORIES = [
    'Vinyl Wraps',
    'Paint Protection Film',
    'Ceramic Coating',
    'Window Tint',
    'Detailing',
    'Wheels & Tires',
    'Performance',
    'Apparel & Merch',
    'Other',
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** True if `v` is one of the platform taxonomy values. */
export function isShopCategory(v: unknown): v is ShopCategory {
    return (
        typeof v === 'string' &&
        (SHOP_CATEGORIES as readonly string[]).includes(v)
    );
}
