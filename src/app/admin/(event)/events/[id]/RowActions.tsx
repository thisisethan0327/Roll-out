'use client';
/**
 * REFUND / REMOVE buttons for the admin event page's RSVP and ticket rows
 * (Part 2). Authorization and every state check are server-side in
 * ./host-actions.ts (requirePlatformAdmin + re-reading the row); the buttons
 * here are convenience.
 *
 * Both refunds fetch a read-only quote first and put the amount and the
 * person in the dialog title, so an admin never refunds blind. The dialog is
 * the Glide confirmDialog, not window.confirm (a browser that auto-dismisses
 * confirm() made the refund silently do nothing), and results show inline on
 * the row, not in alert() (an auto-dismissed alert hid a failed refund).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    adminRefundRsvpAction,
    adminRefundRsvpQuoteAction,
    adminRefundTicketAction,
    adminRefundTicketQuoteAction,
    adminRemoveRsvpAction,
} from './host-actions';
import { CircleAlert, CircleCheck, Undo2, UserMinus } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

function usd(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

type Result = { kind: 'ok' | 'err'; text: string } | null;

/** The outcome of a row action, under its button. Errors stay until the next try. */
function RowResult({ result }: { result: Result }) {
    if (!result) return null;
    const err = result.kind === 'err';
    return (
        <span
            role={err ? 'alert' : 'status'}
            className={a.small}
            style={{
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                justifyContent: 'flex-end',
                marginTop: 6,
                marginLeft: 'auto',
                maxWidth: 280,
                textAlign: 'right',
                color: 'var(--ink)',
                fontWeight: 600,
                whiteSpace: 'normal',
            }}
        >
            {err ? <CircleAlert {...ic} className={a.dangerIc} /> : <CircleCheck {...ic} />}
            <span>{result.text}</span>
        </span>
    );
}

export function TicketRefundButton({
    eventId,
    ticketId,
    buyerHandle,
}: {
    eventId: string;
    ticketId: string;
    /** The order's buyer: the refund goes back to their payment method. */
    buyerHandle?: string | null;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [quoting, setQuoting] = useState(false);
    const [result, setResult] = useState<Result>(null);
    const who = buyerHandle ? `@${buyerHandle}` : 'the buyer';

    const onClick = async () => {
        setResult(null);
        setQuoting(true);
        let q: Awaited<ReturnType<typeof adminRefundTicketQuoteAction>>;
        try {
            q = await adminRefundTicketQuoteAction(eventId, ticketId);
        } catch (e: any) {
            setQuoting(false);
            return setResult({ kind: 'err', text: 'Could not get the refund amount: ' + (e?.message ?? 'unknown') });
        }
        setQuoting(false);
        if (!q.ok) return setResult({ kind: 'err', text: 'Cannot refund: ' + q.error });

        const whole = q.mode === 'whole_order';
        const ok = await confirmDialog({
            title: whole
                ? `Refund ${usd(q.amountCents)} to ${who} and cancel the whole order?`
                : `Refund ${usd(q.amountCents)} to ${who} for this ticket?`,
            message: whole
                ? `${q.windowClosed ? 'This ticket is outside the refund window, so only the whole order can be refunded. ' : ''}All ${q.tickets} ticket${q.tickets === 1 ? '' : 's'} on the order are cancelled. The money goes back to the original payment method. This is logged.`
                : 'Only this ticket is cancelled. The money goes back to the original payment method. This is logged.',
            confirmLabel: 'Refund',
            danger: true,
        });
        if (!ok) return;
        start(async () => {
            try {
                const res = await adminRefundTicketAction(eventId, ticketId, q.mode);
                if (!res.ok) return setResult({ kind: 'err', text: 'Refund failed: ' + res.error });
                setResult({ kind: 'ok', text: res.message });
                router.refresh();
            } catch (e: any) {
                setResult({ kind: 'err', text: 'Refund failed: ' + (e?.message ?? 'unknown') });
            }
        });
    };

    const busy = pending || quoting;
    return (
        <>
            <button className="admin-action-btn danger" disabled={busy} onClick={onClick}>
                <Undo2 {...ic} className={a.dangerIc} />
                {busy ? 'Working…' : 'Refund'}
            </button>
            <RowResult result={result} />
        </>
    );
}

export function RsvpRowActions({
    eventId,
    profileId,
    handle,
    paid,
}: {
    eventId: string;
    profileId: string;
    handle: string;
    paid: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [quoting, setQuoting] = useState(false);
    const [result, setResult] = useState<Result>(null);

    const refund = async () => {
        setResult(null);
        setQuoting(true);
        let q: Awaited<ReturnType<typeof adminRefundRsvpQuoteAction>>;
        try {
            q = await adminRefundRsvpQuoteAction(eventId, profileId);
        } catch (e: any) {
            setQuoting(false);
            return setResult({ kind: 'err', text: 'Could not get the refund amount: ' + (e?.message ?? 'unknown') });
        }
        setQuoting(false);
        if (!q.ok) return setResult({ kind: 'err', text: 'Cannot refund: ' + q.error });

        const ok = await confirmDialog({
            title:
                q.amountCents > 0
                    ? `Refund ${usd(q.amountCents)} to @${handle} and cancel their order?`
                    : `Cancel @${handle}'s order? Nothing is left to refund.`,
            message:
                q.amountCents > 0
                    ? 'The full amount still on the order goes back to the original payment method and the spot is released. This is logged.'
                    : 'The payment is already fully refunded (or was never captured). The order is cancelled and the spot released. This is logged.',
            confirmLabel: q.amountCents > 0 ? 'Refund' : 'Cancel order',
            cancelLabel: q.amountCents > 0 ? 'Cancel' : 'Keep',
            danger: true,
        });
        if (!ok) return;
        start(async () => {
            try {
                const res = await adminRefundRsvpAction(eventId, profileId);
                if (!res.ok) return setResult({ kind: 'err', text: 'Refund failed: ' + res.error });
                setResult({ kind: 'ok', text: res.message });
                router.refresh();
            } catch (e: any) {
                setResult({ kind: 'err', text: 'Refund failed: ' + (e?.message ?? 'unknown') });
            }
        });
    };

    const remove = async () => {
        setResult(null);
        const ok = await confirmDialog({
            title: `Remove @${handle}'s RSVP?`,
            message: 'Their spot on this event is released. This is logged.',
            confirmLabel: 'Remove',
            danger: true,
        });
        if (!ok) return;
        start(async () => {
            try {
                const res = await adminRemoveRsvpAction(eventId, profileId);
                if (!res.ok) return setResult({ kind: 'err', text: 'Remove failed: ' + res.error });
                setResult({ kind: 'ok', text: res.message });
                router.refresh();
            } catch (e: any) {
                setResult({ kind: 'err', text: 'Remove failed: ' + (e?.message ?? 'unknown') });
            }
        });
    };

    const busy = pending || quoting;
    return (
        <>
            {paid ? (
                <button className="admin-action-btn danger" disabled={busy} onClick={refund}>
                    <Undo2 {...ic} className={a.dangerIc} />
                    {busy ? 'Working…' : 'Refund'}
                </button>
            ) : (
                <button className="admin-action-btn muted" disabled={busy} onClick={remove}>
                    <UserMinus {...ic} />
                    {busy ? 'Working…' : 'Remove'}
                </button>
            )}
            <RowResult result={result} />
        </>
    );
}
