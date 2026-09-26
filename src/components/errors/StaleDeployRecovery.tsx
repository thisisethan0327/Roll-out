'use client';
/**
 * Error-boundary body shared by app/error.tsx and app/global-error.tsx.
 *
 * The common crash on rollout.club is not a bug in the page: a tab opened
 * before a deploy posts a server action id the new build no longer has
 * ("Failed to find Server Action … older or newer deployment"), or asks for a
 * JS chunk that was replaced (ChunkLoadError). A fresh load fixes both, so the
 * first error on a page reloads it once, quietly. A second error on the same
 * page within RELOAD_WINDOW_MS is a real one — show a calm retry screen
 * instead of reloading in a loop.
 */
import { useEffect, useState } from 'react';

const KEY = 'rollout:auto-reload';
const RELOAD_WINDOW_MS = 30_000;

function reloadedRecently(path: string): boolean {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return false;
        const { p, t } = JSON.parse(raw) as { p?: string; t?: number };
        return p === path && typeof t === 'number' && Date.now() - t < RELOAD_WINDOW_MS;
    } catch {
        // Storage blocked (private mode / some in-app browsers): fall back to
        // "was this load itself a reload?" so a real error can never loop.
        try {
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
            return nav?.type === "reload";
        } catch {
            return true;
        }
    }
}

function markReload(path: string): void {
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ p: path, t: Date.now() }));
    } catch {
        /* storage blocked (private mode / in-app browser) — reload anyway */
    }
}

export function StaleDeployRecovery({ error }: { error: Error & { digest?: string } }) {
    const [showRetry, setShowRetry] = useState(false);

    useEffect(() => {
        console.error('[rollout] page error', error);
        const path = window.location.pathname + window.location.search;
        if (reloadedRecently(path)) {
            setShowRetry(true);
            return;
        }
        markReload(path);
        window.location.reload();
    }, [error]);

    return (
        <div
            style={{
                minHeight: '60vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 18,
                padding: '48px 16px',
                textAlign: 'center',
                background: '#050505',
                color: '#f2f2f2',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
        >
            <div style={{ fontSize: 12, letterSpacing: '0.2em', color: '#ffb733' }}>
                {showRetry ? '／ SOMETHING WENT WRONG' : '／ UPDATING'}
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, maxWidth: 420, color: '#b5b5b5' }}>
                {showRetry
                    ? 'That didn’t load. If you were paying, check your tickets before trying again, so you don’t pay twice.'
                    : 'Loading the latest version of this page…'}
            </p>
            {showRetry ? (
                <a href="/me/event-tickets" style={{ color: "#ffb733", fontSize: 12, letterSpacing: "0.2em" }}>
                    MY TICKETS ›
                </a>
            ) : null}
            {showRetry ? (
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{
                        background: '#ffb733',
                        color: '#050505',
                        border: 'none',
                        padding: '14px 28px',
                        fontFamily: 'inherit',
                        fontSize: 12,
                        letterSpacing: '0.2em',
                        cursor: 'pointer',
                    }}
                >
                    TRY AGAIN
                </button>
            ) : null}
        </div>
    );
}
