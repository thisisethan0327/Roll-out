/**
 * Site appearance (Glide): Theme System · Light · Dark, and a Dark style,
 * Midnight · Graphite. See docs/design/GLIDE.md, "Theme model".
 *
 * Three theme states, not two: "follow my machine" is a real preference and
 * not the same as "always dark". Resolution: dark applies when Theme = Dark,
 * or when Theme = System and the OS is dark; the dark style then picks
 * Midnight or Graphite.
 *
 * On the page this is <html data-theme="light|dark" data-dark="midnight|graphite">.
 *  - The server stamps an explicit theme and the dark style from the cookies,
 *    so those first paints are right with nothing to run.
 *  - THEME_HEAD_SCRIPT (inline in the root layout's <head>, before any paint)
 *    resolves System from prefers-color-scheme, and follows the OS when it
 *    changes while the choice is still System.
 *  - With scripting off, System leaves data-theme absent and a
 *    prefers-color-scheme block in the CSS decides.
 *
 * Device-only for now: the choice lives in cookies. Storing it on the profile
 * needs a migration (open decision for Ethan).
 *
 * Deliberately separate from the shop console's rollout_shop_theme: a light
 * office console and a dark site at night is a coherent thing to want.
 */
export const THEME_COOKIE = 'rollout-theme';
export const DARK_COOKIE = 'rollout-dark';
/** The pre-Glide cookie. Read as a fallback so an existing choice survives. */
export const LEGACY_THEME_COOKIE = 'rollout_theme';
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeChoice = 'system' | 'light' | 'dark';
export type DarkStyle = 'midnight' | 'graphite';

/** Narrow an untrusted cookie value; anything unrecognised means system. */
export function normalizeTheme(value: string | null | undefined): ThemeChoice {
    return value === 'light' || value === 'dark' ? value : 'system';
}

/** Narrow an untrusted cookie value; anything unrecognised means Midnight. */
export function normalizeDark(value: string | null | undefined): DarkStyle {
    return value === 'graphite' ? 'graphite' : 'midnight';
}

/**
 * The server-stamped `data-theme` for a choice: undefined for System, so the
 * head script (or, without scripting, the media query) resolves it.
 */
export function themeAttribute(choice: ThemeChoice): 'light' | 'dark' | undefined {
    return choice === 'system' ? undefined : choice;
}

/**
 * Inline, render-blocking on purpose: it runs before first paint, so System
 * never flashes the wrong palette. Tiny and dependency-free. It also listens
 * for the OS switching while the choice is System (the cookie is re-read on
 * every change, so a later explicit choice wins).
 */
export const THEME_HEAD_SCRIPT = `(function(){try{var d=document.documentElement;function ck(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?m[1]:null}function choice(){var t=ck('${THEME_COOKIE}')||ck('${LEGACY_THEME_COOKIE}');return t==='light'||t==='dark'?t:'system'}var q=window.matchMedia('(prefers-color-scheme: dark)');function apply(){var c=choice();d.setAttribute('data-theme',c==='system'?(q.matches?'dark':'light'):c)}d.setAttribute('data-dark',ck('${DARK_COOKIE}')==='graphite'?'graphite':'midnight');apply();var on=function(){if(choice()==='system')apply()};q.addEventListener?q.addEventListener('change',on):q.addListener(on)}catch(e){}})();`;

/** Read a cookie in the browser (client components only). */
export function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? m[1] : null;
}

/** Persist and apply an appearance choice live (client components only). */
export function applyAppearance(theme: ThemeChoice, dark: DarkStyle): void {
    const root = document.documentElement;
    const resolved =
        theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-dark', dark);
    const tail = `; Path=/; Max-Age=${THEME_MAX_AGE}; SameSite=Lax`;
    document.cookie = `${THEME_COOKIE}=${theme}${tail}`;
    document.cookie = `${DARK_COOKIE}=${dark}${tail}`;
    // The legacy cookie would otherwise keep winning the fallback read after a
    // switch back to System.
    document.cookie = `${LEGACY_THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent('rollout:appearance', { detail: { theme, dark, resolved } }));
}
