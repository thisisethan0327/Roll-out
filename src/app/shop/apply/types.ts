/**
 * Shared types for the shop application flow. Kept out of the 'use server'
 * action module (which may only export async functions).
 */
export type ApplyState = {
    ok: boolean;
    error?: string;
    field?: string; // which field the error is about, if any
};

export const APPLY_INITIAL: ApplyState = { ok: false };

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
export const UBI_RE = /^\d{9}$/;

// Shop taxonomy is now a shared, platform-defined vocabulary. Re-exported here
// so existing importers (ApplyForm) keep working unchanged.
export { SHOP_CATEGORIES, isShopCategory, type ShopCategory } from '@/lib/shop-categories';
