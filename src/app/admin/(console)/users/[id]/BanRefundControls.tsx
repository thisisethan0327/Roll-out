'use client';
/**
 * The ban refund ledger table with its controls. Authorization and every state
 * check are server-side in ./refund-actions.ts; the buttons shown here are
 * convenience.
 */
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    declineBanRefundRow,
    releaseBanRefundRow,
    runBanRefundRow,
    runPendingBanRefunds,
    type RefundActionResult,
} from './refund-actions';

export type LedgerRow = {
    id: string;
    banId: string;
    kind: 'order' | 'seat';
    orderId: string | null;
    eventId: string | null;
    eventTitle: string | null;
    amountCents: number | null;
    status: string;
    error: string | null;
    attempts: number;
    lastAttemptAt: string | null;
    requestedAt: string | null;
    note: string | null;
    createdAt: string;
};

const PILL: Record<string, string> = {
    pending: 'admin-pill gold',
    requested: 'admin-pill gold',
    refunding: 'admin-pill gold',
    refunded: 'admin-pill neon',
    failed: 'admin-pill warn',
    withheld: 'admin-pill warn',
    declined: 'admin-pill',
    skipped: 'admin-pill',
};

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

export function BanRefundControls({
    rows,
    banId,
    runnableCount,
    banned,
    staleBeforeIso,
}: {
    rows: LedgerRow[];
    banId: string | null;
    runnableCount: number;
    banned: boolean;
    staleBeforeIso: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const run = (fn: () => Promise<RefundActionResult>) => {
        setErr(null);
        setMsg(null);
        start(async () => {
            try {
                const res = await fn();
                if (!res.ok) setErr(res.error ?? 'Failed');
                else setMsg(res.message ?? 'Done.');
                router.refresh();
            } catch (e: any) {
                setErr(e?.message ?? 'Failed');
            }
        });
    };

    const decline = (row: LedgerRow) => {
        const note = prompt('Why decline this refund? (internal, required)');
        if (!note || !note.trim()) return;
        run(() => declineBanRefundRow(row.id, note));
    };

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            {banned && banId && runnableCount > 0 && (
                <div>
                    <button
                        className="admin-action-btn danger"
                        disabled={pending}
                        onClick={() => {
                            if (confirm(`Run ${runnableCount} pending refund(s) now? Money is returned to the original payment method.`)) {
                                run(() => runPendingBanRefunds(banId));
                            }
                        }}
                    >
                        {pending ? 'RUNNING…' : `RUN PENDING REFUNDS (${runnableCount})`}
                    </button>
                </div>
            )}
            {msg && <div style={{ fontSize: 12 }}>{msg}</div>}
            {err && <div style={{ color: 'var(--warn)', fontSize: 12 }}>{err}</div>}
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>EVENT</th>
                            <th>KIND</th>
                            <th>AMOUNT</th>
                            <th>STATUS</th>
                            <th>TRIES</th>
                            <th>DETAIL</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const staleRefunding =
                                r.status === 'refunding' && (r.lastAttemptAt ?? '') < staleBeforeIso;
                            return (
                                <tr key={r.id}>
                                    <td>
                                        {r.eventId ? (
                                            <Link href={`/admin/events/${r.eventId}`} className="text-link">
                                                {r.eventTitle ?? r.eventId.slice(0, 8)}
                                            </Link>
                                        ) : (
                                            '—'
                                        )}
                                        <div className="admin-handle">
                                            {r.orderId ? `ORDER …${r.orderId.slice(-6)} · ` : ''}
                                            {stamp(r.createdAt)}
                                        </div>
                                    </td>
                                    <td>{r.kind === 'order' ? 'ORDER' : 'SEAT'}</td>
                                    <td>{r.amountCents != null ? `$${(r.amountCents / 100).toFixed(2)}` : '—'}</td>
                                    <td>
                                        <span className={PILL[r.status] ?? 'admin-pill'}>{r.status.toUpperCase()}</span>
                                    </td>
                                    <td>{r.attempts}</td>
                                    <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {r.error ? <div style={{ color: 'var(--warn)' }}>{r.error}</div> : null}
                                        {r.note ? <div>{r.note}</div> : null}
                                        {r.requestedAt ? <div className="admin-handle">REQUESTED {stamp(r.requestedAt)}</div> : null}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            {(r.status === 'failed' || staleRefunding) && banned && (
                                                <button
                                                    className="admin-action-btn"
                                                    disabled={pending}
                                                    onClick={() => run(() => runBanRefundRow(r.id))}
                                                >
                                                    RETRY
                                                </button>
                                            )}
                                            {(r.status === 'requested' || r.status === 'skipped') && banned && (
                                                <button
                                                    className="admin-action-btn danger"
                                                    disabled={pending}
                                                    onClick={() =>
                                                        confirm('Refund this ticket now to the original payment method?') &&
                                                        run(() => runBanRefundRow(r.id))
                                                    }
                                                >
                                                    REFUND
                                                </button>
                                            )}
                                            {r.status === 'withheld' && banned && (
                                                <button
                                                    className="admin-action-btn danger"
                                                    disabled={pending}
                                                    onClick={() =>
                                                        confirm('Release this withheld refund and send the money back now?') &&
                                                        run(() => releaseBanRefundRow(r.id))
                                                    }
                                                >
                                                    RELEASE
                                                </button>
                                            )}
                                            {['requested', 'pending', 'withheld', 'failed', 'skipped'].includes(r.status) && (
                                                <button
                                                    className="admin-action-btn muted"
                                                    disabled={pending}
                                                    onClick={() => decline(r)}
                                                >
                                                    DECLINE
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
