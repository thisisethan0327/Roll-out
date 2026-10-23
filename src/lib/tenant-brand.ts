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
    /**
     * Glide token overrides for the console (light, and both dark styles).
     * Rollout's own console has none: Glide's navy and light blue ARE Rollout's
     * brand, so a tenant replaces every accent role, and the tricolore marks
     * (edge stripes, banded stripes, date-roundel rings) are hidden by the
     * console shell whenever a tenant brand is in force.
     */
    glide?: { light: Record<string, string>; dark: Record<string, string> };
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
    // Monochrome: near-black on light, white on dark. Pairs measured AA.
    glide: {
        light: {
            accent: '#141414', 'on-accent': '#FFFFFF', 'on-accent-2': '#D4D4D4',
            knob: '#FFFFFF', 'knob-ink': '#141414', fill: '#3A3A3A',
            'nav-on': '#141414', 'on-nav-on': '#FFFFFF',
            seg: '#141414', 'seg-ink': '#D4D4D4', 'seg-on': '#FFFFFF', 'seg-on-ink': '#141414',
            link: '#141414', icon: '#2B2B2B', title: '#141414',
            tint: '#E8E8E8', 'on-tint': '#141414', done: '#E8E8E8', 'on-done': '#141414',
            'stripe-1': '#8A8A8A', 'stripe-2': '#141414', 'stripe-3': '#8A8A8A',
            // Neutral greys instead of Glide's blue-tinted light surfaces.
            surface: '#F1F1F1', 'surface-2': '#E6E6E6', line: '#E3E3E3', 'line-strong': '#CFCFCF',
            ink: '#161616', 'ink-2': '#5A5A5A', 'ink-3': '#7A7A7A', 'float-ink': '#141414',
            card: '#FFFFFF', float: '#FFFFFF', hud: '#141414',
        },
        dark: {
            accent: '#FFFFFF', 'on-accent': '#141414', 'on-accent-2': '#3A3A3A',
            knob: '#141414', 'knob-ink': '#FFFFFF', fill: '#BDBDBD',
            'nav-on': '#FFFFFF', 'on-nav-on': '#141414',
            seg: '#2D2D2D', 'seg-ink': '#BDBDBD', 'seg-on': '#FFFFFF', 'seg-on-ink': '#141414',
            link: '#FFFFFF', icon: '#D9D9D9', title: '#FFFFFF',
            tint: '#333333', 'on-tint': '#FFFFFF', done: '#333333', 'on-done': '#FFFFFF',
            'stripe-1': '#8A8A8A', 'stripe-2': '#FFFFFF', 'stripe-3': '#8A8A8A',
            // Charcoal in both dark styles: UNITY's register has no navy.
            surface: '#161718', 'surface-2': '#2D2D2D', card: '#222222', float: '#2A2A2B',
            'float-ink': '#F2F2F2', ink: '#F2F2F2', 'ink-2': '#9A9A9A', 'ink-3': '#787878',
            line: '#2A2B2C', 'line-strong': '#404142', hud: '#2D2D2D',
        },
    },
};

/**
 * Popeye Energy's palette (client site tokens.css): red #d7262e, yellow
 * #ffd23f, sea blue #1d4f91. Red and blue are too dark to carry as an accent on
 * the console's black; the yellow reads cleanly and is the brand's pop colour.
 */
const POPEYE_BRAND: ConsoleBrand = {
    label: 'POPEYE ENERGY',
    tagline: 'POPEYE ENERGY · MANAGE YOUR SHOP',
    accent: '#ffd23f',
    accentDim: 'rgba(255, 210, 63, 0.18)',
    accentGlow: 'rgba(255, 210, 63, 0.08)',
    house: 'Popeye Energy',
    // The yellow carries fills (with dark ink); text links stay ink on light.
    glide: {
        light: {
            accent: '#FFD23F', 'on-accent': '#1A1A1A', 'on-accent-2': '#4A3B00',
            knob: '#1A1A1A', 'knob-ink': '#FFD23F', fill: '#E0B200',
            'nav-on': '#1D4F91', 'on-nav-on': '#FFFFFF',
            seg: '#1D4F91', 'seg-ink': '#D6E2F2', 'seg-on': '#FFD23F', 'seg-on-ink': '#1A1A1A',
            link: '#1D4F91', icon: '#1D4F91', title: '#1A1A1A',
            tint: '#FFF3C4', 'on-tint': '#3D3100', done: '#FFF3C4', 'on-done': '#3D3100',
            'stripe-1': '#FFD23F', 'stripe-2': '#1D4F91', 'stripe-3': '#D7262E',
        },
        dark: {
            accent: '#FFD23F', 'on-accent': '#1A1A1A', 'on-accent-2': '#4A3B00',
            knob: '#1A1A1A', 'knob-ink': '#FFD23F', fill: '#E0B200',
            'nav-on': '#FFD23F', 'on-nav-on': '#1A1A1A',
            seg: '#2D2D2D', 'seg-ink': '#C8C8C8', 'seg-on': '#FFD23F', 'seg-on-ink': '#1A1A1A',
            link: '#FFD23F', icon: '#FFD23F', title: '#FFFFFF',
            tint: '#3A3210', 'on-tint': '#FFE58A', done: '#3A3210', 'on-done': '#FFE58A',
            'stripe-1': '#FFD23F', 'stripe-2': '#1D4F91', 'stripe-3': '#D7262E',
        },
    },
};

const BRAND_BY_SLUG: Record<string, ConsoleBrand> = {
    unityusa: UNITY_BRAND,
    popeye: POPEYE_BRAND,
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
    const legacy = `.shop-layout{--gold:${brand.accent};--gold-dim:${brand.accentDim};--gold-glow:${brand.accentGlow};}`;
    if (!brand.glide) return legacy;
    // Glide: the console root and any sheet it opens (sheets portal to <body>).
    const vars = (m: Record<string, string>) =>
        Object.entries(m)
            .map(([k, v]) => `--${k}:${v};`)
            .join('');
    // Every key the dark set overrides must also be set for light, or the
    // dark value would leak into the light palette.
    const missing = Object.keys(brand.glide.dark).filter((k) => !(k in brand.glide!.light));
    if (missing.length) throw new Error(`tenant-brand: light palette is missing ${missing.join(', ')}`);
    const scope = '.glide[data-tenant],body:has(.glide[data-tenant]) .g-sheet-root';
    const light = `:root[data-theme='light'] :is(${scope})`;
    return [
        legacy,
        `:is(${scope}){${vars(brand.glide.dark)}}`,
        `${light}{${vars(brand.glide.light)}}`,
        `@media (prefers-color-scheme: light){:root:not([data-theme]) :is(${scope}){${vars(brand.glide.light)}}}`,
    ].join('');
}
