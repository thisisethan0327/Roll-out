import React from 'react';

/**
 * Server-safe skeleton primitives for store route `loading.tsx` files.
 * A shimmering block + its keyframes, rendered while server fetches resolve so
 * the App Router streams page structure instead of a blank screen.
 */

/** Renders the shimmer keyframes once. Include near the top of a skeleton tree. */
export function SkeletonStyle() {
    return (
        <style>{`
            .rl-skel{background:linear-gradient(90deg,var(--bg-2) 25%,var(--bg-3) 37%,var(--bg-2) 63%);background-size:400% 100%;animation:rlShimmer 1.4s ease infinite;border:1px solid var(--line)}
            @keyframes rlShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
        `}</style>
    );
}

export function Skel({
    w,
    h,
    style,
}: {
    w?: number | string;
    h?: number | string;
    style?: React.CSSProperties;
}) {
    return <div className="rl-skel" style={{ width: w ?? '100%', height: h ?? 16, ...style }} />;
}
