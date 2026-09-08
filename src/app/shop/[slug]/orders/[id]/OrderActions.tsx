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
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PendingButton } from '@/components/feedback';
import {
    shipOrderAction,
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
    /** Fulfilled but not shipped — tracking can still be attached. */
    hasUnshippedFulfillment: boolean;
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
    hasUnshippedFulfillment,
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

    /**
     * Cancel's confirmation used to disarm itself after 3 SECONDS, and that is
     * why CANCEL ORDER "did nothing" on a phone (run 10, lane B): the tap armed
     * it, three seconds passed while the tester looked at the screen, and by
     * the time anyone inspected, the button was back to its unarmed state with
     * no request made and no error logged. Every symptom in that report follows
     * from it — unchanged HTML, no arm state, no network call — and it explains
     * why the same action worked at desk width, where the second click lands
     * within the window, and why REFUND on the same panel was fine: refund has
     * no timer at all.
     *
     * So cancel now behaves like refund. It stays armed until the person acts,
     * and KEEP ORDER dismisses it explicitly. A destructive confirm that
     * silently withdraws itself is worse than one that waits: it does not
     * prevent a mis-tap, it just makes the second tap land somewhere else.
     */

    const canceled = (status ?? '').toLowerCase() === 'canceled';
    const ful = (fulfillmentStatus ?? '').toLowerCase();
    const isShipped = ['shipped', 'partially_shipped', 'delivered'].includes(ful);
    const isDelivered = ful === 'delivered';
    /**
     * Deliverable once the goods have left, and "fulfilled" counts. Gating this
     * on shipped alone meant a fulfilment whose tracking failed to attach could
     * never be marked delivered — the actions panel was empty but for the role
     * sentence, and the only way on was an admin login staff are not meant to
     * have (run 9, lane D).
     */
    const canDeliver =
        !isDelivered && (isShipped || ful === 'fulfilled' || ful === 'partially_fulfilled');
    const isCompleted = (status ?? '').toLowerCase() === 'completed';
    const pay = (paymentStatus ?? '').toLowerCase();
    const refunded = pay === 'refunded' || pay === 'partially_refunded';
    const fullyRefunded = pay === 'refunded';
    /** Cents, or null when the box is not a usable number. Blank means "all". */
    const parsedRefundCents = (() => {
        const raw = refundAmount.trim();
        if (!raw) return null;
        const n = Number(raw.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.round(n * 100);
    })();

    /**
     * Which action is in flight. useTransition gives ONE boolean for the whole
     * component, so passing it to every PendingButton made all seven show their
     * own pending label at once: confirming a cancel relabelled the untouched
     * buttons to FULFILLING and COMPLETING until the transition settled (run
     * 10, lane E). Only the button that was pressed should say anything.
     */
    const [running, setRunning] = useState<string | null>(null);
    const busyOn = (key: string) => pending && running === key;

    const run = (
        fn: () => Promise<{ ok: boolean; error?: string }>,
        okText: string,
        key: string,
    ) => {
        setMsg(null);
        setRunning(key);
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
            } finally {
                setRunning(null);
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
            'fulfil',
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

            {/* Fulfill + tracking. Hidden once the money has gone back: a fully
                refunded order should not invite anybody to put goods in a box
                and send them (run 10, lane G2 on #176). A PARTIAL refund still
                offers it — part of that order may genuinely still ship. */}
            {hasUnfulfilledItems && !fullyRefunded && (
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
                            pending={busyOn('fulfil')}
                            pendingLabel="FULFILLING"
                            onClick={doFulfill}
                        >
                            FULFILL + SHIP
                        </PendingButton>
                    </div>
                </div>
            )}

            {/* Add tracking — a fulfilment exists but never shipped, usually
                because attaching the label failed. Without this the order sat
                at PACKED and staff had no way forward at all. */}
            {!hasUnfulfilledItems && hasUnshippedFulfillment && !fullyRefunded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        Fulfilled but not shipped — add tracking to send it
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
                            pending={busyOn('ship')}
                            pendingLabel="SENDING"
                            onClick={() => {
                                if (!trackingNumber.trim()) {
                                    setMsg({ kind: 'err', text: 'Enter a tracking number first.' });
                                    return;
                                }
                                run(
                                    () => shipOrderAction(slug, orderId, trackingNumber, carrier),
                                    'Tracking added and the order marked shipped.',
                                    'ship',
                                );
                            }}
                        >
                            ADD TRACKING
                        </PendingButton>
                    </div>
                </div>
            )}

            {/* Mark delivered */}
            {canDeliver && (
                <div>
                    <PendingButton
                        type="button"
                        className="admin-action-btn muted"
                        pending={busyOn('deliver')}
                        pendingLabel="UPDATING"
                        onClick={() => run(() => markDeliveredAction(slug, orderId), 'Marked delivered.', 'deliver')}
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
                        pending={busyOn('capture')}
                        pendingLabel="CAPTURING"
                        onClick={() => run(() => capturePaymentAction(slug, orderId), 'Payment captured.', 'capture')}
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
                            pending={busyOn('cancel')}
                            pendingLabel="CANCELING"
                            onClick={() => {
                                setArmed(false);
                                run(() => cancelOrderAction(slug, orderId), 'Order canceled.', 'cancel');
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
                                pending={busyOn('refund')}
                                pendingLabel="REFUNDING"
                                onClick={() => {
                                    setRefundArmed(false);
                                    run(() => refundOrderAction(slug, orderId, parsedRefundCents), 'Refund issued.', 'refund');
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
                            pending={busyOn('complete')}
                            pendingLabel="COMPLETING"
                            onClick={() => run(() => completeOrderAction(slug, orderId), 'Order completed.', 'complete')}
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
