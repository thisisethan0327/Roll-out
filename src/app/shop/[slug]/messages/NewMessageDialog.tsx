'use client';
/**
 * NEW MESSAGE modal — collects a customer @handle and calls the
 * createDirectThreadWithCustomer server action which redirects to the
 * resulting thread page on success.
 */
import { useState, useTransition } from 'react';
import { createDirectThreadWithCustomer } from './actions';
import { CircleAlert, MessageSquarePlus } from 'lucide-react';
import { Sheet } from '@/components/glide/Sheet';
import { GlideButton } from '@/components/glide/primitives';
import { shopStyles as sh } from '@/components/glide-shop/parts';

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

    return (
        <>
            <button
                type="button"
                className={`g-sec ${sh.sec}`}
                onClick={() => {
                    setHandle('');
                    setError(null);
                    setOpen(true);
                }}
                aria-haspopup="dialog"
            >
                <MessageSquarePlus size={18} strokeWidth={2} aria-hidden="true" />
                New message
            </button>
            <Sheet
                open={open}
                onClose={() => setOpen(false)}
                title="New message"
                // Once a handle is typed, a scrim tap no longer throws it away.
                closeOnBackdrop={!handle.trim()}
                // Nothing closes it while the thread is being opened.
                closable={!isPending}
            >
                <div className={sh.sheetBody}>
                    <p>
                        Enter the customer&apos;s @handle. We&apos;ll open or create a direct thread between them
                        and the shop.
                    </p>
                    <label className={sh.label} htmlFor="new-message-handle">
                        Customer handle
                    </label>
                    <input
                        id="new-message-handle"
                        autoFocus
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && handle.trim() && !isPending) {
                                submit();
                            }
                        }}
                        placeholder="@handle"
                        className={sh.field}
                        disabled={isPending}
                    />
                    {error && (
                        <p className={sh.err} role="alert">
                            <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
                            {error}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className={`g-sec g-sec--ink ${sh.sec}`}
                            onClick={() => setOpen(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </button>
                        <GlideButton size="sm" onClick={submit} disabled={isPending || !handle.trim()}>
                            {isPending ? 'Starting…' : 'Start'}
                        </GlideButton>
                    </div>
                </div>
            </Sheet>
        </>
    );
}
