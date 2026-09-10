'use client';

/**
 * Shop-console light/dark toggle. Lives in the ShopSidebar footer.
 *
 * The active theme is stamped SERVER-SIDE onto `.shop-layout` (data-theme) from
 * the `rollout_shop_theme` cookie, so the first paint is already correct — no
 * flash of the wrong theme. This control just flips that attribute live and
 * writes the cookie (source of truth for the next SSR render) plus a localStorage
 * mirror. Scope is the shop console only: the attribute never leaves .shop-layout,
 * so the marketing site, /me, and /admin are unaffected.
 */
import { useEffect, useState } from 'react';

const COOKIE = 'rollout_shop_theme';
const LS_KEY = 'rollout_shop_theme';
const ONE_YEAR = 60 * 60 * 24 * 365;

type Theme = 'dark' | 'light';

export function ShopThemeToggle() {
    const [theme, setTheme] = useState<Theme>('dark');

    // Adopt whatever the server already stamped (avoids a flash / mismatch).
    useEffect(() => {
        const root = document.querySelector('.shop-layout');
        setTheme(root?.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    }, []);

    const apply = (next: Theme) => {
        setTheme(next);
        const root = document.querySelector('.shop-layout') as HTMLElement | null;
        if (root) root.setAttribute('data-theme', next);
        // Cookie drives the SSR attribute on the next load (no flash-of-wrong-theme).
        document.cookie = `${COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
        try {
            localStorage.setItem(LS_KEY, next);
        } catch {
            /* private mode / storage disabled — cookie still persists */
        }
    };

    const isLight = theme === 'light';
    const nextLabel = isLight ? 'dark' : 'light';

    return (
        <button
            type="button"
            className="shop-theme-toggle"
            onClick={() => apply(isLight ? 'dark' : 'light')}
            aria-label={`Switch to ${nextLabel} mode`}
            title={`Switch to ${nextLabel} mode`}
        >
            <span className="shop-theme-toggle-track" data-on={isLight}>
                <span className="shop-theme-toggle-icon sun" aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" strokeLinecap="round" />
                    </svg>
                </span>
                <span className="shop-theme-toggle-icon moon" aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" strokeLinejoin="round" />
                    </svg>
                </span>
                <span className="shop-theme-toggle-knob" />
            </span>
            <span>{isLight ? 'LIGHT' : 'DARK'}</span>
        </button>
    );
}
