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
import { Undo2 } from 'lucide-react';
import { adminStyles as a, sentence } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

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
        <div className={a.stack}>
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
                        <Undo2 {...ic} className={a.dangerIc} />
                        {pending ? 'Running…' : `Run pending refunds (${runnableCount})`}
                    </button>
                </div>
            )}
            {msg && (
                <div className={a.note} role="status">
                    {msg}
                </div>
            )}
            {err && (
                <div className="admin-login-error" role="alert">
                    {err}
                </div>
            )}
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Kind</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Tries</th>
                            <th>Detail</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
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
                                            {r.orderId ? `Order …${r.orderId.slice(-6)} · ` : ''}
                                            {stamp(r.createdAt)}
                                        </div>
                                    </td>
                                    <td>{r.kind === 'order' ? 'Order' : 'Seat'}</td>
                                    <td className={a.num}>{r.amountCents != null ? `$${(r.amountCents / 100).toFixed(2)}` : '—'}</td>
                                    <td>
                                        <span className={PILL[r.status] ?? 'admin-pill'}>{sentence(r.status)}</span>
                                    </td>
                                    <td>{r.attempts}</td>
                                    <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {r.error ? <div style={{ fontWeight: 600 }}>{r.error}</div> : null}
                                        {r.note ? <div>{r.note}</div> : null}
                                        {r.requestedAt ? <div className="admin-handle">Requested {stamp(r.requestedAt)}</div> : null}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            {(r.status === 'failed' || staleRefunding) && banned && (
                                                <button
                                                    className="admin-action-btn"
                                                    disabled={pending}
                                                    onClick={() => run(() => runBanRefundRow(r.id))}
                                                >
                                                    Retry
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
                                                    <Undo2 {...ic} className={a.dangerIc} /> Refund
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
                                                    <Undo2 {...ic} className={a.dangerIc} /> Release
                                                </button>
                                            )}
                                            {['requested', 'pending', 'withheld', 'failed', 'skipped'].includes(r.status) && (
                                                <button
                                                    className="admin-action-btn muted"
                                                    disabled={pending}
                                                    onClick={() => decline(r)}
                                                >
                                                    Decline
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
