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
                    ☀
                </span>
                <span className="shop-theme-toggle-icon moon" aria-hidden>
                    ☾
                </span>
                <span className="shop-theme-toggle-knob" />
            </span>
            <span>{isLight ? 'LIGHT' : 'DARK'}</span>
        </button>
    );
}
