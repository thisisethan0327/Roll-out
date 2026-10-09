'use client';
/**
 * One-time confirmation shown on the home page after /me/settings deletes the
 * member's account (the action redirects to /?account_deleted=1). Reads the flag
 * client-side on purpose: the home page is statically revalidated, and reading
 * searchParams on the server would make it dynamic for every visitor.
 */
import { useEffect, useState } from 'react';

export function AccountDeletedNotice() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get('account_deleted') === '1') {
                setShow(true);
                url.searchParams.delete('account_deleted');
                window.history.replaceState(null, '', url.pathname + url.search + url.hash);
            }
        } catch {
            /* no-op: the notice is a courtesy */
        }
    }, []);

    if (!show) return null;
    return (
        <div
            role="status"
            style={{
                padding: '12px 16px',
                background: 'var(--gold-dim)',
                border: '1px solid var(--gold)',
                color: 'var(--gold)',
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                letterSpacing: 'var(--track-wider)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <span>YOUR ROLLOUT PROFILE HAS BEEN DELETED. YOU HAVE BEEN SIGNED OUT.</span>
            <button type="button" className="admin-action-btn muted" onClick={() => setShow(false)}>
                DISMISS
            </button>
        </div>
    );
}
