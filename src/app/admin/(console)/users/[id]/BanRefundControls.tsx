'use client';
/**
 * The ban refund ledger table with its controls. Authorization and every state
 * check are server-side in ./refund-actions.ts; the buttons shown here are
 * convenience.
 *
 * Every money action asks through the Glide confirmDialog with the amount and
 * the member in the title (never window.confirm, which a browser can
 * auto-dismiss), and a decline asks for its reason in the same dialog instead
 * of prompt(). Results show inline above the table.
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
import { confirmDialog } from '@/components/glide/confirm';

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

function usd(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

export function BanRefundControls({
    rows,
    banId,
    runnableCount,
    banned,
    staleBeforeIso,
    handle,
}: {
    rows: LedgerRow[];
    banId: string | null;
    runnableCount: number;
    banned: boolean;
    staleBeforeIso: string;
    /** The banned member: the refunds go back to their payment methods. */
    handle: string;
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

    // The rows "Run pending refunds" picks up: the latest ban's pending and
    // skipped rows (runPendingBanRefunds → processBanRefunds), same filter as
    // the page's runnableCount. Unknown amounts are counted, never guessed.
    const runnable = rows.filter((r) => r.banId === banId && (r.status === 'pending' || r.status === 'skipped'));
    const runnableKnown = runnable.filter((r) => r.amountCents != null);
    const runnableTotal = runnableKnown.reduce((s, r) => s + (r.amountCents ?? 0), 0);
    const runnableUnknown = runnable.length - runnableKnown.length;

    const rowAmount = (r: LedgerRow) => (r.amountCents != null ? usd(r.amountCents) : null);
    const rowWhat = (r: LedgerRow) =>
        `${r.kind === 'order' ? 'Order' : 'Seat'}${r.eventTitle ? ` for ${r.eventTitle}` : ''}${r.orderId ? ` (order …${r.orderId.slice(-6)})` : ''}.`;

    const runAll = async () => {
        if (!banId) return;
        const n = runnableCount;
        const money =
            runnableKnown.length > 0
                ? ` — ${usd(runnableTotal)}${runnableUnknown > 0 ? ` plus ${runnableUnknown} without an amount on file` : ''}`
                : '';
        const ok = await confirmDialog({
            title: `Run ${n} pending refund${n === 1 ? '' : 's'}${money}?`,
            message: `Money goes back to @${handle}'s original payment methods. This is logged.`,
            confirmLabel: 'Run refunds',
            danger: true,
        });
        if (ok) run(() => runPendingBanRefunds(banId));
    };

    const refundRow = async (r: LedgerRow) => {
        const amt = rowAmount(r);
        const ok = await confirmDialog({
            title: amt ? `Refund ${amt} to @${handle}?` : `Refund this ticket to @${handle}?`,
            message: `${rowWhat(r)} The money goes back to the original payment method. This is logged.`,
            confirmLabel: 'Refund',
            danger: true,
        });
        if (ok) run(() => runBanRefundRow(r.id));
    };

    const releaseRow = async (r: LedgerRow) => {
        const amt = rowAmount(r);
        const ok = await confirmDialog({
            title: amt ? `Release withheld refund of ${amt} to @${handle}?` : `Release this withheld refund to @${handle}?`,
            message: `${rowWhat(r)} The money is sent back now, to the original payment method. This is logged.`,
            confirmLabel: 'Release',
            danger: true,
        });
        if (ok) run(() => releaseBanRefundRow(r.id));
    };

    const decline = async (row: LedgerRow) => {
        const amt = rowAmount(row);
        const note = await confirmDialog({
            title: amt ? `Decline the ${amt} refund to @${handle}?` : `Decline this refund to @${handle}?`,
            message: `${rowWhat(row)} No money is sent.`,
            reason: { label: 'Why decline (internal)', required: true, maxLength: 1000 },
            confirmLabel: 'Decline',
            danger: true,
        });
        if (!note) return;
        run(() => declineBanRefundRow(row.id, note));
    };

    return (
        <div className={a.stack}>
            {banned && banId && runnableCount > 0 && (
                <div>
                    <button
                        className="admin-action-btn danger"
                        disabled={pending}
                        onClick={runAll}
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
                                                    onClick={() => refundRow(r)}
                                                >
                                                    <Undo2 {...ic} className={a.dangerIc} /> Refund
                                                </button>
                                            )}
                                            {r.status === 'withheld' && banned && (
                                                <button
                                                    className="admin-action-btn danger"
                                                    disabled={pending}
                                                    onClick={() => releaseRow(r)}
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
