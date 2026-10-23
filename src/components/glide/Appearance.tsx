'use client';
/**
 * Appearance: Theme (System · Light · Dark) and Dark style (Midnight ·
 * Graphite). Writes the rollout-theme / rollout-dark cookies and re-themes the
 * page live (lib/theme.ts applyAppearance). Device-only: nothing is written to
 * the profile until a migration for it is approved.
 *
 * The dark style stays selectable in Light, since it is what System or Dark
 * will use later; the note under it says so.
 */
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Segmented } from './Segmented';
import {
    DARK_COOKIE,
    LEGACY_THEME_COOKIE,
    THEME_COOKIE,
    applyAppearance,
    normalizeDark,
    normalizeTheme,
    readCookie,
    type DarkStyle,
    type ThemeChoice,
} from '@/lib/theme';

export function Appearance({ compact = false, idPrefix = 'appearance' }: { compact?: boolean; idPrefix?: string }) {
    const [theme, setTheme] = useState<ThemeChoice>('system');
    const [dark, setDark] = useState<DarkStyle>('midnight');
    const [osDark, setOsDark] = useState(true);

    // Adopt the stored choice after mount, so the control agrees with the paint.
    useEffect(() => {
        setTheme(normalizeTheme(readCookie(THEME_COOKIE) ?? readCookie(LEGACY_THEME_COOKIE)));
        setDark(normalizeDark(readCookie(DARK_COOKIE)));
        const q = window.matchMedia('(prefers-color-scheme: dark)');
        setOsDark(q.matches);
        const on = () => setOsDark(q.matches);
        q.addEventListener?.('change', on);
        // Another Appearance control on the page (footer + settings) stays in step.
        const sync = (e: Event) => {
            const d = (e as CustomEvent<{ theme: ThemeChoice; dark: DarkStyle }>).detail;
            if (d) {
                setTheme(d.theme);
                setDark(d.dark);
            }
        };
        window.addEventListener('rollout:appearance', sync);
        return () => {
            q.removeEventListener?.('change', on);
            window.removeEventListener('rollout:appearance', sync);
        };
    }, []);

    const pickTheme = (t: ThemeChoice) => {
        setTheme(t);
        applyAppearance(t, dark);
    };
    const pickDark = (d: DarkStyle) => {
        setDark(d);
        applyAppearance(theme, d);
    };

    const darkInUse = theme === 'dark' || (theme === 'system' && osDark);
    const iconSize = compact ? 15 : 16;

    return (
        <div className="g-appear">
            <div>
                <span className="g-appear-lbl" id={`${idPrefix}-theme`}>
                    Theme
                </span>
                <Segmented<ThemeChoice>
                    label="Theme"
                    value={theme}
                    onChange={pickTheme}
                    options={[
                        { value: 'system', label: <><Monitor size={iconSize} aria-hidden="true" />System</> },
                        { value: 'light', label: <><Sun size={iconSize} aria-hidden="true" />Light</> },
                        { value: 'dark', label: <><Moon size={iconSize} aria-hidden="true" />Dark</> },
                    ]}
                />
            </div>
            <div>
                <span className="g-appear-lbl" id={`${idPrefix}-dark`}>
                    Dark style
                </span>
                <Segmented<DarkStyle>
                    label="Dark style"
                    value={dark}
                    onChange={pickDark}
                    options={[
                        { value: 'midnight', label: <><span className="g-appear-sw" style={{ background: '#111D33' }} aria-hidden="true" />Midnight</> },
                        { value: 'graphite', label: <><span className="g-appear-sw" style={{ background: '#2D2D2D' }} aria-hidden="true" />Graphite</> },
                    ]}
                />
                {!compact || !darkInUse ? (
                    <p className="g-appear-note" style={{ marginTop: 6 }}>
                        {darkInUse ? 'Midnight is deep navy. Graphite is charcoal.' : 'Used whenever the dark theme is on.'}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
