'use client';

import React from 'react';

/**
 * Shared store-front loading primitives (HUD aesthetic, --gold accent).
 * Kept inside the store lane so every store surface shares one working-state
 * language without a design overhaul.
 */

/** Pulsing three-dot "working" indicator — inline, sits after button labels. */
export function Dots() {
    return (
        <span className="rl-dots" aria-hidden="true">
            <span />
            <span />
            <span />
            <style>{`
                .rl-dots{display:inline-flex;gap:4px;align-items:center;margin-left:9px;vertical-align:middle}
                .rl-dots > span{width:5px;height:5px;border-radius:50%;background:var(--gold);opacity:.35;animation:rlDot 1s infinite ease-in-out}
                .rl-dots > span:nth-child(2){animation-delay:.15s}
                .rl-dots > span:nth-child(3){animation-delay:.3s}
                @keyframes rlDot{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
            `}</style>
        </span>
    );
}

/** Thin indeterminate sweep bar — used under Stripe while the element mounts. */
export function SweepBar({ style }: { style?: React.CSSProperties }) {
    return (
        <span className="rl-sweep" style={style} aria-hidden="true">
            <span />
            <style>{`
                .rl-sweep{position:relative;display:block;height:2px;width:100%;overflow:hidden;background:var(--line)}
                .rl-sweep > span{position:absolute;top:0;left:0;height:100%;width:40%;background:var(--gold);animation:rlSweep 1.15s infinite ease-in-out}
                @keyframes rlSweep{0%{left:-40%}100%{left:100%}}
            `}</style>
        </span>
    );
}
