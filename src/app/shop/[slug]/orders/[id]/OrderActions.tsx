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
 * Cancel uses the two-click "armed" pattern rather than window.confirm, which
 * is unreliable here. Refund, Capture and Complete ask through the Glide
 * confirmDialog, whose title names the dollar figure and the order number
 * (overlay plan Phase 0 #4): a blank refund amount is resolved to the
 * refundable remainder BEFORE the dialog, so nobody refunds an unseen
 * figure. Every action re-derives the vendor
 * from the slug and re-verifies the order's vendor before touching Medusa; this
 * component only drives UX.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PendingButton } from '@/components/feedback';
import { CircleCheck, CircleX, CreditCard, PackageCheck, Truck, Undo2 } from 'lucide-react';
import { CardHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import { confirmDialog } from '@/components/glide/confirm';
import bz from '@/components/glide-shopbiz/biz.module.css';
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
    /** Order number as staff see it (display_id), for the confirm titles. */
    orderNumber: string;
    currency: string | null;
    /** Captured minus refunded on the captured payment, in currency units; null if there is none. */
    refundable: number | null;
    /** Amount on the still-authorized (legacy) payment, in currency units. */
    authorizedAmount: number | null;
};

function money(amount: number, currency: string | null): string {
    const cur = (currency ?? 'usd').toUpperCase();
    return `${cur === 'USD' ? '$' : cur + ' '}${amount.toFixed(2)}`;
}

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
    orderNumber,
    currency,
    refundable,
    authorizedAmount,
}: Props) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [trackingNumber, setTrackingNumber] = useState('');
    const [carrier, setCarrier] = useState('ups');
    const [armed, setArmed] = useState(false);
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

    /**
     * Refund: settle the figure first (typed amount, or the refundable
     * remainder when blank), refuse what the server would refuse, then ask
     * with that figure in the title. A blank box still sends "all" (null) so
     * the server refunds the exact remainder, which is the figure shown.
     */
    const askRefund = async () => {
        setMsg(null);
        if (refundAmount.trim() && parsedRefundCents == null) {
            setMsg({ kind: 'err', text: 'Enter a refund amount like 24.99, or leave it blank to refund everything.' });
            return;
        }
        if (refundable != null && refundable <= 0.005) {
            setMsg({ kind: 'err', text: 'This payment has already been fully refunded.' });
            return;
        }
        if (parsedRefundCents != null && refundable != null && parsedRefundCents / 100 > refundable + 0.005) {
            setMsg({ kind: 'err', text: `That is more than the ${money(refundable, currency)} still refundable on this payment.` });
            return;
        }
        const amount = parsedRefundCents != null ? parsedRefundCents / 100 : refundable;
        const all = parsedRefundCents == null || (refundable != null && parsedRefundCents / 100 >= refundable - 0.005);
        const ok = await confirmDialog({
            title:
                amount != null
                    ? `Refund ${money(amount, currency)} on order #${orderNumber}?`
                    : `Refund everything still refundable on order #${orderNumber}?`,
            message: all
                ? "That is everything still refundable on this payment. It goes back to the customer's original payment method."
                : `A partial refund${refundable != null ? ` (of ${money(refundable, currency)} still refundable)` : ''}. It goes back to the customer's original payment method.`,
            confirmLabel: 'Refund',
            danger: true,
        });
        if (!ok) return;
        run(() => refundOrderAction(slug, orderId, parsedRefundCents), 'Refund issued.', 'refund');
    };

    const ic = { size: 17, strokeWidth: 2, 'aria-hidden': true } as const;

    if (canceled) {
        return (
            <section className="g-card" aria-labelledby="oa-h">
                <CardHead id="oa-h" title="Actions" />
                <div className={cx(cs.cardBody, cs.form)}>
                    <p className={cs.small}>This order is canceled — no further actions are available.</p>
                    {msg && <Banner msg={msg} />}
                </div>
            </section>
        );
    }

    /** Carrier + tracking number, shared by "fulfil" and "add tracking". */
    const trackingFields = (
        <div className={bz.trackGrid}>
            <div className={cs.field}>
                <label className={cs.label} htmlFor="oa-carrier">
                    Carrier
                </label>
                <select
                    id="oa-carrier"
                    className={cx(cs.input, bz.in)}
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    disabled={pending}
                >
                    {CARRIERS.map((c) => (
                        <option key={c.value} value={c.value}>
                            {c.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className={cs.field}>
                <label className={cs.label} htmlFor="oa-tracking">
                    Tracking number
                </label>
                <input
                    id="oa-tracking"
                    className={cx(cs.input, bz.in)}
                    placeholder="1Z…"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    disabled={pending}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                />
            </div>
        </div>
    );

    return (
        <section className="g-card g-edge" aria-labelledby="oa-h">
            <CardHead id="oa-h" title="Actions" />
            <div className={cx(cs.cardBody, cs.form)} style={{ paddingBottom: 30 }}>
                {/* Fulfill + tracking. Hidden once the money has gone back: a fully
                    refunded order should not invite anybody to put goods in a box
                    and send them (run 10, lane G2 on #176). A PARTIAL refund still
                    offers it — part of that order may genuinely still ship. */}
                {hasUnfulfilledItems && !fullyRefunded && (
                    <div className={bz.step}>
                        <h3 className={bz.stepH}>Create fulfillment with tracking</h3>
                        {trackingFields}
                        <PendingButton
                            type="button"
                            className="g-btn g-btn--sm g-btn--block"
                            pending={busyOn('fulfil')}
                            pendingLabel="Fulfilling"
                            onClick={doFulfill}
                        >
                            <span>Fulfill and ship</span>
                            <span className="g-btn-k" aria-hidden="true">
                                <Truck size={18} strokeWidth={2} />
                            </span>
                        </PendingButton>
                    </div>
                )}

                {/* Add tracking — a fulfilment exists but never shipped, usually
                    because attaching the label failed. Without this the order sat
                    at PACKED and staff had no way forward at all. */}
                {!hasUnfulfilledItems && hasUnshippedFulfillment && !fullyRefunded && (
                    <div className={bz.step}>
                        <h3 className={bz.stepH}>Fulfilled but not shipped — add tracking to send it</h3>
                        {trackingFields}
                        <PendingButton
                            type="button"
                            className="g-btn g-btn--sm g-btn--block"
                            pending={busyOn('ship')}
                            pendingLabel="Sending"
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
                            <span>Add tracking</span>
                            <span className="g-btn-k" aria-hidden="true">
                                <Truck size={18} strokeWidth={2} />
                            </span>
                        </PendingButton>
                    </div>
                )}

                {/* Mark delivered */}
                {canDeliver && (
                    <div className={bz.acts}>
                        <PendingButton
                            type="button"
                            className={bz.act}
                            pending={busyOn('deliver')}
                            pendingLabel="Updating"
                            onClick={() => run(() => markDeliveredAction(slug, orderId), 'Marked delivered.', 'deliver')}
                        >
                            <PackageCheck {...ic} />
                            Mark delivered
                        </PendingButton>
                    </div>
                )}

                {/* Capture (legacy authorized-only) */}
                {canMoney && hasAuthorizedPayment && (
                    <div className={bz.step}>
                        <div className={bz.acts}>
                            <PendingButton
                                type="button"
                                className={bz.act}
                                pending={busyOn('capture')}
                                pendingLabel="Capturing"
                                onClick={async () => {
                                    const ok = await confirmDialog({
                                        title:
                                            authorizedAmount != null
                                                ? `Capture ${money(authorizedAmount, currency)} on order #${orderNumber}?`
                                                : `Capture the authorized payment on order #${orderNumber}?`,
                                        message: "The customer's card is charged.",
                                        confirmLabel: 'Capture',
                                    });
                                    if (ok) run(() => capturePaymentAction(slug, orderId), 'Payment captured.', 'capture');
                                }}
                            >
                                <CreditCard {...ic} />
                                Capture payment
                            </PendingButton>
                        </div>
                        <p className={bz.fine}>This payment is still authorized (legacy). New orders capture automatically.</p>
                    </div>
                )}

                {/* Money actions — owner/admin/manager only. Hidden rather than
                    disabled: a button that exists to refuse you is just noise. The
                    server refuses regardless (see ../actions.ts). */}
                {canMoney && (
                    <div className={bz.money}>
                        <h3 className={bz.stepH}>Payment and order</h3>
                        {armed ? (
                            <div className={bz.step}>
                                <div className={bz.acts}>
                                    <PendingButton
                                        type="button"
                                        className={cx(bz.act, bz.actArmed)}
                                        pending={busyOn('cancel')}
                                        pendingLabel="Canceling"
                                        onClick={() => {
                                            setArmed(false);
                                            run(() => cancelOrderAction(slug, orderId), 'Order canceled.', 'cancel');
                                        }}
                                    >
                                        <CircleX {...ic} />
                                        Confirm cancel
                                    </PendingButton>
                                    <button type="button" className={cx(bz.act, bz.actInk)} onClick={() => setArmed(false)} disabled={pending}>
                                        Keep order
                                    </button>
                                </div>
                                <p className={bz.fine} role="status">
                                    Click confirm to cancel this order.
                                </p>
                            </div>
                        ) : (
                            <div className={bz.acts}>
                                <button type="button" className={cx(bz.act, bz.actInk, bz.actDanger)} onClick={() => setArmed(true)} disabled={pending}>
                                    <CircleX {...ic} />
                                    Cancel order
                                </button>
                            </div>
                        )}

                        {/* Refund — two-click armed, like cancel. Empty amount refunds
                            everything still refundable; the server validates the figure
                            against captured minus already-refunded either way. Tax
                            reverses itself through the refund-order-tax subscriber. */}
                        <div className={bz.refundRow}>
                            <div className={cs.field}>
                                <label className={cs.label} htmlFor="oa-refund">
                                    Refund amount
                                </label>
                                <div className={cs.affix}>
                                    <span aria-hidden="true">$</span>
                                    <input
                                        id="oa-refund"
                                        className={cx(cs.input, bz.in)}
                                        placeholder="0.00"
                                        inputMode="decimal"
                                        value={refundAmount}
                                        onChange={(e) => setRefundAmount(e.target.value)}
                                        disabled={pending}
                                        aria-describedby="oa-refund-hint"
                                    />
                                </div>
                                <p className={cs.hint} id="oa-refund-hint">
                                    {refundable != null && refundable > 0
                                        ? `Leave blank to refund all ${money(refundable, currency)} still refundable.`
                                        : 'Leave blank to refund everything still refundable.'}
                                </p>
                            </div>
                            <div className={bz.acts}>
                                <PendingButton
                                    type="button"
                                    className={cx(bz.act, bz.actInk)}
                                    pending={busyOn('refund')}
                                    pendingLabel="Refunding"
                                    onClick={askRefund}
                                    disabled={pending}
                                >
                                    <Undo2 {...ic} />
                                    Refund
                                </PendingButton>
                            </div>
                        </div>

                        {/* Complete — the terminal state for goods that are not coming
                            back. Only offered once the order has shipped or been
                            refunded, matching the /app widget and the server check. */}
                        {!canceled && !isCompleted && (refunded || isShipped) && (
                            <div className={bz.step}>
                                <div className={bz.acts}>
                                    <PendingButton
                                        type="button"
                                        className={bz.act}
                                        pending={busyOn('complete')}
                                        pendingLabel="Completing"
                                        onClick={async () => {
                                            const ok = await confirmDialog({
                                                title: `Complete order #${orderNumber}? It can't be reopened.`,
                                                message: 'Completing closes the order for good. Custom goods are not returnable: if money is owed back, refund first.',
                                                confirmLabel: 'Complete',
                                                danger: true,
                                            });
                                            if (ok) run(() => completeOrderAction(slug, orderId), 'Order completed.', 'complete');
                                        }}
                                    >
                                        <CircleCheck {...ic} />
                                        Complete order
                                    </PendingButton>
                                </div>
                                <p className={bz.fine}>Closes the order for good. Custom goods are not returnable — refund, then complete.</p>
                            </div>
                        )}
                    </div>
                )}

                {!canMoney && (
                    <p className={cx(bz.fine, bz.money)}>
                        Capture, cancel, refund and complete need an owner or admin. Your role is {role}.
                    </p>
                )}

                {msg && <Banner msg={msg} />}
            </div>
        </section>
    );
}

function Banner({ msg }: { msg: { kind: 'ok' | 'err'; text: string } }) {
    return (
        <Notice tone={msg.kind === 'ok' ? 'ok' : 'bad'} live>
            {msg.text}
        </Notice>
    );
}
