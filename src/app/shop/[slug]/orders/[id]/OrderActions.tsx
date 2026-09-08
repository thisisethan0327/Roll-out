'use client';
/**
 * Order actions, in two tiers.
 *
 * MANAGE — fulfil with tracking, mark delivered. Any shop member.
 * MONEY  — capture, cancel, refund, complete. Owner, admin and manager only,
 *          passed in as `canMoney` and hidden for everyone else. Hidden rather
 *          than disabled: a button whose only purpose is to refuse you is
 *          noise. Hiding is NOT the enforcement — every action re-checks the
 *          caller's role server-side in ../actions.ts, because a server action
 *          is a public endpoint and hidden is not forbidden.
 *
 * Cancel and refund both use the two-click "armed" pattern rather than
 * window.confirm, which is unreliable here. Every action re-derives the vendor
 * from the slug and re-verifies the order's vendor before touching Medusa; this
 * component only drives UX.
 */
import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PendingButton } from '@/components/feedback';
import {
    fulfillOrderAction,
    markDeliveredAction,
    capturePaymentAction,
    cancelOrderAction,
    refundOrderAction,
    completeOrderAction,
} from '../actions';

const CARRIERS = [
    { value: 'ups', label: 'UPS' },
    { value: 'usps', label: 'USPS' },
    { value: 'fedex', label: 'FedEx' },
    { value: 'dhl', label: 'DHL' },
    { value: 'other', label: 'Other' },
];

type Props = {
    slug: string;
    orderId: string;
    status: string | null;
    paymentStatus: string | null;
    fulfillmentStatus: string | null;
    hasAuthorizedPayment: boolean;
    hasUnfulfilledItems: boolean;
    /** Owner/admin/manager: may move money and end the order. */
    canMoney: boolean;
    role: string;
};

export function OrderActions({
    slug,
    orderId,
    status,
    paymentStatus,
    fulfillmentStatus,
    hasAuthorizedPayment,
    hasUnfulfilledItems,
    canMoney,
    role,
}: Props) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [trackingNumber, setTrackingNumber] = useState('');
    const [carrier, setCarrier] = useState('ups');
    const [armed, setArmed] = useState(false);
    const [refundArmed, setRefundArmed] = useState(false);
    const [refundAmount, setRefundAmount] = useState('');

    // Disarm the cancel confirmation after 3s.
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(t);
    }, [armed]);

    const canceled = (status ?? '').toLowerCase() === 'canceled';
    const ful = (fulfillmentStatus ?? '').toLowerCase();
    const isShipped = ['shipped', 'partially_shipped', 'delivered'].includes(ful);
    const isDelivered = ful === 'delivered';
    const isCompleted = (status ?? '').toLowerCase() === 'completed';
    const pay = (paymentStatus ?? '').toLowerCase();
    const refunded = pay === 'refunded' || pay === 'partially_refunded';
    /** Cents, or null when the box is not a usable number. Blank means "all". */
    const parsedRefundCents = (() => {
        const raw = refundAmount.trim();
        if (!raw) return null;
        const n = Number(raw.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.round(n * 100);
    })();

    const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
        setMsg(null);
        start(async () => {
            try {
                const res = await fn();
                if (res.ok) {
                    setMsg({ kind: res.error ? 'err' : 'ok', text: res.error || okText });
                    router.refresh();
                } else {
                    setMsg({ kind: 'err', text: res.error || 'Action failed.' });
                }
            } catch (e: any) {
                setMsg({ kind: 'err', text: e?.message ?? 'Action failed.' });
            }
        });
    };

    const doFulfill = () => {
        if (!trackingNumber.trim()) {
            setMsg({ kind: 'err', text: 'Enter a tracking number first.' });
            return;
        }
        run(
            () => fulfillOrderAction(slug, orderId, trackingNumber, carrier),
            'Fulfillment created and marked shipped with tracking.',
        );
    };

    const wrap: React.CSSProperties = {
        border: '1px solid var(--line)',
        background: 'var(--bg-1)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    };
    const titleStyle: React.CSSProperties = {
        fontFamily: 'var(--font-display)',
        fontSize: 10,
        letterSpacing: 'var(--track-widest)',
        color: 'var(--text-3)',
    };

    if (canceled) {
        return (
            <div style={wrap}>
                <div style={titleStyle}>ACTIONS</div>
                <div className="admin-handle" style={{ fontSize: 12 }}>
                    This order is canceled — no further actions are available.
                </div>
                {msg && <Banner msg={msg} />}
            </div>
        );
    }

    return (
        <div style={wrap}>
            <div style={titleStyle}>ACTIONS</div>

            {/* Fulfill + tracking */}
            {hasUnfulfilledItems && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        Create fulfillment with tracking
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select
                            className="admin-form-input"
                            value={carrier}
                            onChange={(e) => setCarrier(e.target.value)}
                            style={{ width: 120 }}
                            disabled={pending}
                        >
                            {CARRIERS.map((c) => (
                                <option key={c.value} value={c.value}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                        <input
                            className="admin-form-input"
                            placeholder="Tracking number"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            style={{ flex: 1, minWidth: 180 }}
                            disabled={pending}
                        />
                        <PendingButton
                            type="button"
                            className="admin-action-btn"
                            pending={pending}
                            pendingLabel="FULFILLING"
                            onClick={doFulfill}
                        >
                            FULFILL + SHIP
                        </PendingButton>
                    </div>
                </div>
            )}

            {/* Mark delivered */}
            {isShipped && !isDelivered && (
                <div>
                    <PendingButton
                        type="button"
                        className="admin-action-btn muted"
                        pending={pending}
                        pendingLabel="UPDATING"
                        onClick={() => run(() => markDeliveredAction(slug, orderId), 'Marked delivered.')}
                    >
                        MARK DELIVERED
                    </PendingButton>
                </div>
            )}

            {/* Capture (legacy authorized-only) */}
            {canMoney && hasAuthorizedPayment && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <PendingButton
                        type="button"
                        className="admin-action-btn"
                        pending={pending}
                        pendingLabel="CAPTURING"
                        onClick={() => run(() => capturePaymentAction(slug, orderId), 'Payment captured.')}
                    >
                        CAPTURE PAYMENT
                    </PendingButton>
                    <div className="admin-handle" style={{ fontSize: 10 }}>
                        This payment is still authorized (legacy). New orders capture automatically.
                    </div>
                </div>
            )}

            {/* Money actions — owner/admin/manager only. Hidden rather than
                disabled: a button that exists to refuse you is just noise. The
                server refuses regardless (see ../actions.ts). */}
            {canMoney && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                {armed ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <PendingButton
                            type="button"
                            className="admin-action-btn danger"
                            pending={pending}
                            pendingLabel="CANCELING"
                            onClick={() => {
                                setArmed(false);
                                run(() => cancelOrderAction(slug, orderId), 'Order canceled.');
                            }}
                        >
                            CONFIRM CANCEL
                        </PendingButton>
                        <button
                            type="button"
                            className="admin-action-btn muted"
                            onClick={() => setArmed(false)}
                            disabled={pending}
                        >
                            KEEP ORDER
                        </button>
                        <span className="admin-handle" style={{ fontSize: 10 }}>
                            Click confirm to cancel this order.
                        </span>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="admin-action-btn muted"
                        onClick={() => setArmed(true)}
                        disabled={pending}
                    >
                        CANCEL ORDER
                    </button>
                )}

                {/* Refund — two-click armed, like cancel. Empty amount refunds
                    everything still refundable; the server validates the figure
                    against captured minus already-refunded either way. Tax
                    reverses itself through the refund-order-tax subscriber. */}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        className="admin-input"
                        placeholder="Refund amount (blank = all)"
                        inputMode="decimal"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        style={{ width: 200 }}
                        disabled={pending}
                    />
                    {refundArmed ? (
                        <>
                            <PendingButton
                                type="button"
                                className="admin-action-btn danger"
                                pending={pending}
                                pendingLabel="REFUNDING"
                                onClick={() => {
                                    setRefundArmed(false);
                                    run(() => refundOrderAction(slug, orderId, parsedRefundCents), 'Refund issued.');
                                }}
                            >
                                CONFIRM REFUND
                            </PendingButton>
                            <button
                                type="button"
                                className="admin-action-btn muted"
                                onClick={() => setRefundArmed(false)}
                                disabled={pending}
                            >
                                KEEP PAYMENT
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="admin-action-btn muted"
                            onClick={() => {
                                if (refundAmount.trim() && parsedRefundCents == null) {
                                    setMsg({ kind: 'err', text: 'Enter a refund amount like 24.99, or leave it blank to refund everything.' });
                                    return;
                                }
                                setRefundArmed(true);
                            }}
                            disabled={pending}
                        >
                            REFUND
                        </button>
                    )}
                </div>

                {/* Complete — the terminal state for goods that are not coming
                    back. Only offered once the order has shipped or been
                    refunded, matching the /app widget and the server check. */}
                {!canceled && !isCompleted && (refunded || isShipped) && (
                    <div style={{ marginTop: 12 }}>
                        <PendingButton
                            type="button"
                            className="admin-action-btn"
                            pending={pending}
                            pendingLabel="COMPLETING"
                            onClick={() => run(() => completeOrderAction(slug, orderId), 'Order completed.')}
                        >
                            COMPLETE ORDER
                        </PendingButton>
                        <div className="admin-handle" style={{ fontSize: 10, marginTop: 4 }}>
                            Closes the order for good. Custom goods are not returnable — refund, then complete.
                        </div>
                    </div>
                )}
            </div>
            )}

            {!canMoney && (
                <div className="admin-handle" style={{ fontSize: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    Capture, cancel, refund and complete need an owner or admin. Your role is {role}.
                </div>
            )}

            {msg && <Banner msg={msg} />}
        </div>
    );
}

function Banner({ msg }: { msg: { kind: 'ok' | 'err'; text: string } }) {
    return (
        <div
            style={{
                fontSize: 12,
                padding: '8px 10px',
                border: '1px solid ' + (msg.kind === 'ok' ? 'var(--line-mid)' : 'var(--warn, #c0392b)'),
                background: 'var(--bg-2)',
                color: msg.kind === 'ok' ? 'var(--gold)' : 'var(--warn, #e57373)',
            }}
        >
            {msg.text}
        </div>
    );
}
