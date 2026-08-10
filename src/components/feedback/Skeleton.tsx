/**
 * Skeleton primitives for route-level loading.tsx files and Suspense fallbacks.
 *
 * Pure server-safe markup (no hooks) styled by the `.rl-skel*` classes in
 * globals.css — a shimmer sweep in the HUD idiom. Compose these to mirror the
 * shape of the real content so a navigation reads as "loading", never "hung".
 */
import type { CSSProperties } from 'react';

/** A single shimmering block. Width/height overridable via props or style. */
export function Skeleton({
    width,
    height,
    radius,
    style,
    className,
}: {
    width?: number | string;
    height?: number | string;
    radius?: number | string;
    style?: CSSProperties;
    className?: string;
}) {
    return (
        <span
            className={`rl-skel rl-skel--block${className ? ` ${className}` : ''}`}
            style={{ width, height, borderRadius: radius, ...style }}
            aria-hidden="true"
        />
    );
}

/** A stack of text lines; the last is shortened for a natural paragraph shape. */
export function SkeletonText({
    lines = 3,
    gap = 8,
    lastWidth = '60%',
}: {
    lines?: number;
    gap?: number;
    lastWidth?: string;
}) {
    return (
        <span style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
            {Array.from({ length: lines }).map((_, i) => (
                <span
                    key={i}
                    className="rl-skel rl-skel--line"
                    style={i === lines - 1 ? { width: lastWidth } : undefined}
                />
            ))}
        </span>
    );
}

/** A framed card skeleton (border + bg matching panels). */
export function SkeletonCard({
    lines = 2,
    style,
}: {
    lines?: number;
    style?: CSSProperties;
}) {
    return (
        <div className="rl-skel-card" style={style} aria-hidden="true">
            <span className="rl-skel rl-skel--line" style={{ width: '40%', height: 14 }} />
            <SkeletonText lines={lines} />
        </div>
    );
}

/** A "LOADING …" eyebrow with animated dots for the top of a skeleton screen. */
export function SkeletonHeading({
    label = 'LOADING',
    sub,
}: {
    label?: string;
    sub?: string;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <span className="rl-skel-eyebrow">
                {label}
                <span className="rl-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                </span>
            </span>
            {sub ? (
                <span className="rl-skel rl-skel--line" style={{ width: 220, height: 12 }} />
            ) : null}
        </div>
    );
}

/**
 * A list of row skeletons (border-separated) — mirrors the dashboard tables and
 * /me activity lists. `cols` controls how many cells per row.
 */
export function SkeletonRows({
    rows = 5,
    cols = 3,
}: {
    rows?: number;
    cols?: number;
}) {
    return (
        <div aria-hidden="true">
            {Array.from({ length: rows }).map((_, r) => (
                <div
                    key={r}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '14px 0',
                        borderBottom: '1px solid var(--line)',
                    }}
                >
                    {Array.from({ length: cols }).map((_, c) => (
                        <span
                            key={c}
                            className="rl-skel rl-skel--line"
                            style={{
                                height: 12,
                                width: c === 0 ? '30%' : c === cols - 1 ? 64 : '18%',
                                marginLeft: c === cols - 1 ? 'auto' : undefined,
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
