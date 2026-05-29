'use client';
/**
 * NEW MESSAGE modal — collects a customer @handle and calls the
 * createDirectThreadWithCustomer server action which redirects to the
 * resulting thread page on success.
 */
import { useState, useTransition } from 'react';
import { createDirectThreadWithCustomer } from './actions';

export function NewMessageDialog({ shopId }: { shopId: number }) {
    const [open, setOpen] = useState(false);
    const [handle, setHandle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const submit = () => {
        setError(null);
        startTransition(async () => {
            try {
                await createDirectThreadWithCustomer(shopId, handle);
            } catch (e: any) {
                // Next.js redirect() throws an internal NEXT_REDIRECT — let it bubble.
                if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
                setError(e?.message ?? 'Failed to start thread.');
            }
        });
    };

    if (!open) {
        return (
            <button
                type="button"
                className="admin-action-btn"
                onClick={() => {
                    setHandle('');
                    setError(null);
                    setOpen(true);
                }}
            >
                NEW MESSAGE ›
            </button>
        );
    }

    return (
        <>
            <button type="button" className="admin-action-btn" onClick={() => setOpen(false)}>
                NEW MESSAGE ›
            </button>
            <div
                role="dialog"
                aria-modal="true"
                onClick={() => !isPending && setOpen(false)}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 200,
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--bg-1)',
                        border: '1px solid var(--line-mid)',
                        padding: 24,
                        width: 'min(420px, 92vw)',
                        boxShadow: '0 0 0 1px var(--gold-glow)',
                    }}
                >
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 14,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--gold)',
                            marginBottom: 12,
                        }}
                    >
                        NEW MESSAGE
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: 'var(--text-2)',
                            marginBottom: 16,
                        }}
                    >
                        Enter the customer&apos;s @handle. We&apos;ll open or create a
                        direct thread between them and the shop.
                    </div>
                    <input
                        autoFocus
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && handle.trim() && !isPending) {
                                submit();
                            }
                            if (e.key === 'Escape' && !isPending) setOpen(false);
                        }}
                        placeholder="@handle"
                        className="admin-search-input"
                        style={{ width: '100%', marginBottom: 12 }}
                        disabled={isPending}
                    />
                    {error && (
                        <div
                            style={{
                                fontSize: 11,
                                color: 'var(--warn)',
                                marginBottom: 12,
                                fontFamily: 'var(--font-display)',
                                letterSpacing: 'var(--track-wider)',
                            }}
                        >
                            {error}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            className="admin-action-btn muted"
                            onClick={() => setOpen(false)}
                            disabled={isPending}
                        >
                            CANCEL
                        </button>
                        <button
                            type="button"
                            className="admin-action-btn"
                            onClick={submit}
                            disabled={isPending || !handle.trim()}
                        >
                            {isPending ? 'STARTING…' : 'START ›'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
