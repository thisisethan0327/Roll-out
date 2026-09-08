/**
 * Per-tenant skin for the console.
 *
 * The console is one codebase serving several brands. On rollout.club it is
 * Rollout's, gold on black. On a tenant's own door it should be theirs — Ethan's
 * requirement is that UNITY staff never see "Rollout" while doing their job
 * (2026-09-08).
 *
 * Deliberately small. The console already names the SHOP everywhere it matters
 * — the sidebar wordmark is the shop's name, page headings are its data — so
 * what is left is the accent colour, the few places the word "Rollout" is
 * written into chrome, and the sign-in stamp. This resolves those; it is not a
 * theming engine.
 *
 * `accent` overrides --gold on the console root. Everything downstream already
 * reads that variable (including the light-mode token set scoped to
 * .shop-layout), so one override reskins buttons, active nav, focus rings and
 * eyebrows together.
 */
export type ConsoleBrand = {
    /** What this console calls itself. Shown in the sign-in stamp. */
    label: string;
    /** Second line of the sign-in stamp. */
    tagline: string;
    /** Replaces --gold on the console root. */
    accent: string;
    /** --gold-dim / --gold-glow equivalents, so the whole ramp stays coherent. */
    accentDim: string;
    accentGlow: string;
    /** The house this console belongs to, for the rare sentence that needs it. */
    house: string;
};

export const ROLLOUT_BRAND: ConsoleBrand = {
    label: 'ROLLOUT',
    tagline: 'ROLLOUT · MANAGE YOUR SHOP',
    accent: '#ffb733',
    accentDim: 'rgba(255, 183, 51, 0.18)',
    accentGlow: 'rgba(255, 183, 51, 0.08)',
    house: 'Rollout',
};

/**
 * UNITY's register is dark, white and mono — no gold. White reads as the accent
 * against the console's black, which is what their storefront does.
 */
const UNITY_BRAND: ConsoleBrand = {
    label: 'UNITY USA',
    tagline: 'UNITY USA · MANAGE YOUR SHOP',
    accent: '#ffffff',
    accentDim: 'rgba(255, 255, 255, 0.16)',
    accentGlow: 'rgba(255, 255, 255, 0.06)',
    house: 'UNITY USA',
};

const BRAND_BY_SLUG: Record<string, ConsoleBrand> = {
    unityusa: UNITY_BRAND,
};

/**
 * The brand for a shop's console. Rollout is the default and always the
 * fallback — an unknown slug gets the console it has always had, never a blank
 * one.
 */
export function brandForSlug(slug: string | null | undefined): ConsoleBrand {
    if (!slug) return ROLLOUT_BRAND;
    return BRAND_BY_SLUG[slug] ?? ROLLOUT_BRAND;
}

/**
 * CSS overriding the accent ramp on the console root, or '' for Rollout (where
 * the defaults already say it). Returned as text for a <style> tag rather than
 * inline vars, so it applies to the whole subtree including the light-mode
 * token set.
 */
export function brandStyle(brand: ConsoleBrand): string {
    if (brand === ROLLOUT_BRAND) return '';
    return `.shop-layout{--gold:${brand.accent};--gold-dim:${brand.accentDim};--gold-glow:${brand.accentGlow};}`;
}
