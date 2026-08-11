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
