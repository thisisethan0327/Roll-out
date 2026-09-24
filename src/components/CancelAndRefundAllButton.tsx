'use client';
/**
 * "Cancel event & refund everyone" — the paid-event replacement for a plain
 * CANCEL button (077). Shared by the three cancel surfaces: the host's own
 * event editor (/me/events/[id]), the shop console's event editor
 * (/shop/[slug]/events/[id]), and the admin events list. All three call the
 * SAME server actions (lib/event-refund-actions.ts → lib/event-refund.ts),
 * so there is one refund-then-cancel implementation, not three.
 *
 * Typed confirmation (type the event title) rather than window.confirm() or a
 * plain two-click arm — this both cancels an event AND moves real money back
 * to every paid ticket holder, so it gets the highest-friction confirmation
 * in the app.
 */
import { useState, useTransition } from 'react';
import {
    previewEventRefundAllAction,
    cancelEventAndRefundAllAction,
} from '@/lib/event-refund-actions';
import type { CancelAllResult } from '@/lib/event-refund';

function formatCents(cents: number, currency: string | null): string {
    const cur = (currency ?? 'usd').toUpperCase();
    const amount = (cents / 100).toFixed(2);
    return cur === 'USD' ? `$${amount}` : `${cur} ${amount}`;
}

export function CancelAndRefundAllButton({
    eventId,
    eventTitle,
    onDone,
    className,
}: {
    eventId: string;
    eventTitle: string;
    /** Called after a successful (or partially-failed) run, e.g. router.refresh(). */
    onDone?: () => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [preview, setPreview] = useState<{ paidCount: number; totalCents: number; currency: string | null } | null>(null);
    const [typed, setTyped] = useState('');
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<CancelAllResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const openDialog = () => {
        setOpen(true);
        setResult(null);
        setError(null);
        setTyped('');
        setLoadingPreview(true);
        startTransition(async () => {
            try {
                const p = await previewEventRefundAllAction(eventId);
                setPreview(p);
            } catch (e: any) {
                setError(e?.message ?? 'Could not load a refund estimate.');
            } finally {
                setLoadingPreview(false);
            }
        });
    };

    const confirm = () => {
        setError(null);
        startTransition(async () => {
            try {
                const res = await cancelEventAndRefundAllAction(eventId);
                setResult(res);
                if (res.ok) onDone?.();
            } catch (e: any) {
                setError(e?.message ?? 'Cancel & refund failed.');
            }
        });
    };

    const typedMatches = typed.trim().length > 0 && typed.trim() === eventTitle.trim();

    if (!open) {
        return (
            <button
                type="button"
                className={className ?? 'admin-action-btn danger'}
                onClick={openDialog}
            >
                CANCEL EVENT & REFUND EVERYONE
            </button>
        );
    }

    return (
        <div
            style={{
                border: '1px solid var(--warn, #ff6b6b)',
                background: 'var(--bg-2)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                maxWidth: 480,
            }}
        >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: 1, color: 'var(--warn, #ff6b6b)' }}>
                CANCEL EVENT & REFUND EVERYONE
            </div>

            {result ? (
                <ResultSummary result={result} />
            ) : (
                <>
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                        This cancels the event immediately and refunds every confirmed
                        paid ticket in full, regardless of the 72-hour window — full
                        refund on host cancellation is the policy. If a refund fails,
                        that ticket holder stays on the cancelled event until you run
                        this again.
                    </p>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>
                        {loadingPreview ? (
                            'Loading refund estimate…'
                        ) : preview ? (
                            preview.paidCount > 0 ? (
                                <>
                                    <strong>{preview.paidCount}</strong> paid ticket{preview.paidCount === 1 ? '' : 's'} ·{' '}
                                    estimated <strong>{formatCents(preview.totalCents, preview.currency)}</strong> to refund
                                </>
                            ) : (
                                'No confirmed paid tickets found — this will just cancel the event.'
                            )
                        ) : null}
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                        <span className="text-dim">
                            Type the event title (<strong style={{ color: 'var(--text)' }}>{eventTitle}</strong>) to confirm
                        </span>
                        <input
                            className="admin-form-input"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={eventTitle}
                            disabled={pending}
                        />
                    </label>
                    {error ? <div className="admin-form-error">{error}</div> : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="admin-action-btn danger"
                            disabled={!typedMatches || pending || loadingPreview}
                            onClick={confirm}
                        >
                            {pending ? 'CANCELLING & REFUNDING…' : 'CONFIRM — CANCEL & REFUND ALL'}
                        </button>
                        <button
                            type="button"
                            className="admin-action-btn muted"
                            disabled={pending}
                            onClick={() => setOpen(false)}
                        >
                            KEEP EVENT
                        </button>
                    </div>
                </>
            )}

            {result ? (
                <button type="button" className="admin-action-btn muted" onClick={() => setOpen(false)}>
                    CLOSE
                </button>
            ) : null}
        </div>
    );
}

function ResultSummary({ result }: { result: CancelAllResult }) {
    if (!result.ok) {
        return <div className="admin-form-error">{result.error}</div>;
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <div style={{ color: 'var(--gold)' }}>✓ Event cancelled.</div>
            <div>{result.refunded} refunded now.</div>
            {result.alreadyDone > 0 ? <div>{result.alreadyDone} already refunded/cancelled (no-op).</div> : null}
            {result.failed.length > 0 ? (
                <div style={{ color: 'var(--warn, #ff6b6b)' }}>
                    {result.failed.length} failed — re-run to retry just these:
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {result.failed.map((f) => (
                            <li key={f.profile_id + (f.order_id ?? '')} style={{ fontSize: 12 }}>
                                {f.order_id ?? f.profile_id}: {f.error}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            <div className="text-dim" style={{ fontSize: 11 }}>
                Ticket holders will also receive Stripe&apos;s own refund receipt by email.
            </div>
        </div>
    );
}
