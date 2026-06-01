'use client';
import { useEffect, useState } from 'react';

/**
 * Live T-minus countdown to a future ISO timestamp.
 * Renders zero-padded D / H / M / S boxes; flips to "LIVE NOW" at start
 * and "PAST EVENT" after. Server-side first paint shows a static initial value
 * to avoid layout shift; the client effect upgrades to ticking.
 */
export function Countdown({ startAt }: { startAt: string }) {
    const [now, setNow] = useState<number>(() => new Date(startAt).getTime() - 1000);
    useEffect(() => {
        // Sync once on mount so SSR/client diff doesn't matter.
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const start = new Date(startAt).getTime();
    const diff = start - now;

    let label: string;
    let cells: { value: string; label: string }[] = [];

    if (Number.isNaN(start)) {
        label = 'DATE TBA';
    } else if (diff <= -2 * 60 * 60 * 1000) {
        label = 'PAST EVENT';
    } else if (diff <= 0) {
        label = 'LIVE NOW';
    } else {
        const d = Math.floor(diff / 86_400_000);
        const h = Math.floor((diff % 86_400_000) / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        const s = Math.floor((diff % 60_000) / 1000);
        cells = [
            { value: String(d).padStart(2, '0'), label: 'DAYS' },
            { value: String(h).padStart(2, '0'), label: 'HRS' },
            { value: String(m).padStart(2, '0'), label: 'MIN' },
            { value: String(s).padStart(2, '0'), label: 'SEC' },
        ];
        label = 'T-MINUS';
    }

    if (cells.length === 0) {
        return (
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    border: '1px solid var(--gold)',
                    background: 'var(--gold-dim)',
                    color: 'var(--gold)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    letterSpacing: 'var(--track-wider)',
                }}
            >
                <span style={{ width: 6, height: 6, background: 'var(--gold)', display: 'inline-block' }} />
                {label}
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'stretch',
                gap: 1,
                background: 'var(--line)',
                border: '1px solid var(--line-mid)',
            }}
        >
            <div
                style={{
                    background: 'var(--bg-1)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--gold)',
                }}
            >
                <span style={{ width: 5, height: 5, background: 'var(--gold)', display: 'inline-block' }} />
                {label}
            </div>
            {cells.map((c) => (
                <div
                    key={c.label}
                    style={{
                        background: 'var(--bg-1)',
                        padding: '6px 12px',
                        textAlign: 'center',
                        minWidth: 52,
                    }}
                >
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text)', lineHeight: 1, letterSpacing: 1 }}>
                        {c.value}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, letterSpacing: 'var(--track-wider)', color: 'var(--text-3)', marginTop: 4 }}>
                        {c.label}
                    </div>
                </div>
            ))}
        </div>
    );
}
