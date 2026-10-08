'use client';
import { useEffect, useState, type ReactNode } from 'react';

const KEY = 'rollout_ann_dismissed';

function readDismissed(): string[] {
    try {
        const raw = window.localStorage.getItem(KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

/**
 * Wrapper for one announcement. Server-rendered visible (no layout jump for
 * first-time visitors); a dismissed `info` notice hides itself right after
 * hydration. Only info is dismissible; warning/critical never render the
 * button and ignore any stored id.
 */
export function AnnouncementShell({
    id,
    dismissible,
    className,
    role,
    children,
}: {
    id: string;
    dismissible: boolean;
    className: string;
    role: 'status' | 'alert';
    children: ReactNode;
}) {
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        if (dismissible && readDismissed().includes(id)) setHidden(true);
    }, [id, dismissible]);
    if (hidden) return null;

    const dismiss = () => {
        setHidden(true);
        try {
            const next = Array.from(new Set([...readDismissed(), id])).slice(-50);
            window.localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
            /* private mode: dismissed for this view only */
        }
    };

    return (
        <div className={className} role={role}>
            {children}
            {dismissible ? (
                <button type="button" className="ann-x" onClick={dismiss} aria-label="Dismiss this update">
                    ✕
                </button>
            ) : null}
        </div>
    );
}
