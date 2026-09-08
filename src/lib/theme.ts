/**
 * Site theme: system (default), light, or dark.
 *
 * Three states, not two, and the distinction matters. An explicit dark choice
 * and no choice at all look identical on a dark-default site, but they are not
 * the same thing: only "no choice" should follow the operating system when
 * somebody switches their laptop to light at sunset.
 *
 * An explicit choice is stamped on <html> server-side from the cookie, so the
 * first paint is already correct and there is no flash and no blocking script
 * in <head>. "System" stamps nothing, and a `prefers-color-scheme` block in
 * globals.css does the rest in pure CSS.
 *
 * Deliberately a SEPARATE cookie from the shop console's rollout_shop_theme.
 * A shop owner who wants a light office console and a dark site at night is not
 * confused, they are correct, and one cookie could not express it.
 */
export const THEME_COOKIE = 'rollout_theme';
export const THEME_STORAGE_KEY = 'rollout_theme';
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Narrow an untrusted cookie value; anything unrecognised means system. */
export function normalizeTheme(value: string | null | undefined): ThemeChoice {
    return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * The `data-theme` attribute for a choice — undefined for system, so the
 * attribute is ABSENT rather than set to "system". The CSS keys the system
 * default on `:root:not([data-theme])`, so an attribute with any value at all
 * would defeat it.
 */
export function themeAttribute(choice: ThemeChoice): 'light' | 'dark' | undefined {
    return choice === 'system' ? undefined : choice;
}
