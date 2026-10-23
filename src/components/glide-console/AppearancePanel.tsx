'use client';
/**
 * The Appearance setting as G7 draws it: Theme as a segmented control (System ·
 * Light · Dark) with a line saying what is showing right now, then Dark style
 * as two preview cards (Midnight, Graphite) drawn in their own palettes.
 *
 * Same storage and behaviour as the kit's <Appearance> (lib/theme.ts
 * applyAppearance: cookies, live re-theme, the rollout:appearance event), so
 * the two stay in step. The kit control has no preview-card form, which is why
 * this lives here (noted for the kit).
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Moon, Smartphone, Sun } from 'lucide-react';
import { Segmented } from '@/components/glide/Segmented';
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
import a from './appearance.module.css';

const STYLES: { value: DarkStyle; label: string; sub: string }[] = [
    { value: 'midnight', label: 'Midnight', sub: 'Deep navy' },
    { value: 'graphite', label: 'Graphite', sub: 'Charcoal grey' },
];

export function AppearancePanel() {
    const [theme, setTheme] = useState<ThemeChoice>('system');
    const [dark, setDark] = useState<DarkStyle>('midnight');
    const [osDark, setOsDark] = useState(false);
    const [ready, setReady] = useState(false);
    const cards = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        setTheme(normalizeTheme(readCookie(THEME_COOKIE) ?? readCookie(LEGACY_THEME_COOKIE)));
        setDark(normalizeDark(readCookie(DARK_COOKIE)));
        const q = window.matchMedia('(prefers-color-scheme: dark)');
        setOsDark(q.matches);
        setReady(true);
        const on = () => setOsDark(q.matches);
        q.addEventListener?.('change', on);
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

    const resolvedDark = theme === 'dark' || (theme === 'system' && osDark);
    const styleName = dark === 'graphite' ? 'Graphite' : 'Midnight';

    // Arrow keys move between the two cards, as in a radio group.
    const onKey = (e: React.KeyboardEvent) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const next = dark === 'midnight' ? 'graphite' : 'midnight';
        pickDark(next);
        cards.current[STYLES.findIndex((x) => x.value === next)]?.focus();
    };

    const ic = { size: 17, strokeWidth: 1.9, 'aria-hidden': true } as const;

    return (
        <div className={a.wrap}>
            <div>
                <h3 className={a.h} id="ap-theme">
                    Theme
                </h3>
                <p className={a.sub}>Light, dark, or match your device.</p>
                <Segmented<ThemeChoice>
                    label="Theme"
                    value={theme}
                    onChange={pickTheme}
                    className={a.seg}
                    options={[
                        { value: 'system', label: <><Smartphone {...ic} />System</> },
                        { value: 'light', label: <><Sun {...ic} />Light</> },
                        { value: 'dark', label: <><Moon {...ic} />Dark</> },
                    ]}
                />
                <p className={a.hint} aria-live="polite">
                    {!ready ? ' ' : theme === 'system' ? (
                        <>
                            Matches your device. <b>{resolvedDark ? `Dark, in ${styleName}` : 'Light'}</b> right now.
                        </>
                    ) : theme === 'dark' ? (
                        <>
                            Rollout stays dark, in <b>{styleName}</b>.
                        </>
                    ) : (
                        <>Rollout stays light.</>
                    )}
                </p>
            </div>

            <div>
                <h3 className={a.h} id="ap-dark">
                    Dark style
                </h3>
                <p className={a.sub}>Used when Rollout is dark, or when System is dark.</p>
                <div className={a.cards} role="radiogroup" aria-labelledby="ap-dark" onKeyDown={onKey}>
                    {STYLES.map((st, i) => {
                        const on = dark === st.value;
                        return (
                            <button
                                key={st.value}
                                ref={(el) => {
                                    cards.current[i] = el;
                                }}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                tabIndex={on ? 0 : -1}
                                className={a.card}
                                onClick={() => {
                                    if (!on) pickDark(st.value);
                                }}
                            >
                                <Mock pal={st.value} />
                                <span className={a.lbl}>
                                    <span className={a.t}>
                                        <b>{st.label}</b>
                                        <small>{st.sub}</small>
                                    </span>
                                    <span className={a.rd} aria-hidden="true">
                                        <Check size={15} strokeWidth={3} />
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** A small screen drawn in one palette's own colours, whatever the page is in. */
function Mock({ pal }: { pal: DarkStyle }) {
    return (
        <span className={a.mock} data-pal={pal} aria-hidden="true">
            <i className={a.mH1} />
            <i className={a.mH2} />
            <i className={a.mCard}>
                <i className={a.mRn} />
                <i className={a.mL1} />
                <i className={a.mL2} />
                <i className={a.mC1} />
                <i className={a.mC2} />
            </i>
            <i className={a.mRows}>
                <i className={a.mIc} style={{ top: 9 }} />
                <i className={a.mRl} style={{ top: 12 }} />
                <i className={a.mRv} style={{ top: 12.5 }} />
                <i className={a.mIc} style={{ top: 39 }} />
                <i className={a.mRl} style={{ top: 42, width: 44 }} />
                <i className={a.mRv} style={{ top: 42.5 }} />
            </i>
            <i className={a.mPill}>
                <i className={a.mPl} />
                <i className={a.mKb}>
                    <ArrowRight size={12} strokeWidth={2.5} />
                </i>
            </i>
        </span>
    );
}
