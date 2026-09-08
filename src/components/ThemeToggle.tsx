'use client';
/**
 * Site theme control: system → light → dark → system.
 *
 * Three states rather than a two-way switch, because "follow my machine" is a
 * real preference and not the same as "always dark". The server has already
 * stamped an explicit choice on <html>; this reads that back so the button
 * never disagrees with the paint, then flips the attribute live and persists.
 *
 * The cookie is the source of truth for the next SSR render — that is what
 * makes the first paint correct with no flash and no blocking head script. The
 * localStorage mirror is only a convenience for anything client-side that wants
 * to know without parsing cookies.
 *
 * Separate from the shop console's own toggle on purpose: a light office
 * console and a dark site at night is a coherent thing to want.
 */
import { useEffect, useState } from 'react';

import {
    THEME_COOKIE,
    THEME_MAX_AGE,
    THEME_STORAGE_KEY,
    normalizeTheme,
    type ThemeChoice,
} from '@/lib/theme';

const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

const LABEL: Record<ThemeChoice, string> = {
    system: 'System theme',
    light: 'Light theme',
    dark: 'Dark theme',
};

function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" strokeLinecap="round" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" strokeLinejoin="round" />
        </svg>
    );
}

/** Half sun, half moon — the state that is neither, and follows the machine. */
function SystemIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="8.4" />
            <path d="M12 3.6a8.4 8.4 0 0 0 0 16.8Z" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function ThemeToggle({ className }: { className?: string }) {
    const [choice, setChoice] = useState<ThemeChoice>('system');

    // Adopt whatever the server stamped, so the control agrees with the paint.
    useEffect(() => {
        const attr = document.documentElement.getAttribute('data-theme');
        if (attr === 'light' || attr === 'dark') {
            setChoice(attr);
            return;
        }
        // No attribute means system — but read the mirror anyway in case the
        // cookie was blocked and only localStorage survived.
        try {
            setChoice(normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)));
        } catch {
            setChoice('system');
        }
    }, []);

    const apply = (next: ThemeChoice) => {
        setChoice(next);

        const root = document.documentElement;
        if (next === 'system') {
            // REMOVE the attribute rather than setting it to "system": the CSS
            // keys the system default on :root:not([data-theme]), so any value
            // at all would defeat it.
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', next);
        }

        document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${THEME_MAX_AGE}; SameSite=Lax`;
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            /* private mode — the cookie still persists the choice */
        }
    };

    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];

    return (
        <button
            type="button"
            className={className ?? 'site-theme-toggle'}
            onClick={() => apply(next)}
            title={`${LABEL[choice]} — switch to ${next}`}
            aria-label={`${LABEL[choice]}. Switch to ${next}.`}
            data-testid="theme-toggle"
        >
            {choice === 'system' ? <SystemIcon /> : choice === 'light' ? <SunIcon /> : <MoonIcon />}
        </button>
    );
}
