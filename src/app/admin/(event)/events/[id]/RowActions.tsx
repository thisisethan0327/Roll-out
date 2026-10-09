'use client';
/**
 * REFUND / REMOVE buttons for the admin event page's RSVP and ticket rows
 * (Part 2). Authorization and every state check are server-side in
 * ./host-actions.ts (requirePlatformAdmin + re-reading the row); the buttons
 * here are convenience. The REFUND confirm shows the amount first (a read-only
 * quote) so an admin never refunds blind.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    adminRefundRsvpAction,
    adminRefundTicketAction,
    adminRefundTicketQuoteAction,
    adminRemoveRsvpAction,
} from './host-actions';

function usd(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

export function TicketRefundButton({ eventId, ticketId }: { eventId: string; ticketId: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();

    const onClick = () =>
        start(async () => {
            try {
                const q = await adminRefundTicketQuoteAction(eventId, ticketId);
                if (!q.ok) return alert('Cannot refund: ' + q.error);
                const what =
                    q.mode === 'share'
                        ? `Refund ${usd(q.amountCents)} for THIS ticket only to the buyer's original payment method?`
                        : `${q.windowClosed ? 'This ticket is outside the refund window. ' : ''}Refund ${usd(q.amountCents)} and CANCEL THE WHOLE ORDER (${q.tickets} ticket${q.tickets === 1 ? '' : 's'}) to the buyer's original payment method?`;
                if (!confirm(what + ' This is logged.')) return;
                const res = await adminRefundTicketAction(eventId, ticketId, q.mode);
                if (!res.ok) return alert('Refund failed: ' + res.error);
                router.refresh();
            } catch (e: any) {
                alert('Refund failed: ' + (e?.message ?? 'unknown'));
            }
        });

    return (
        <button className="admin-action-btn danger" disabled={pending} onClick={onClick}>
            {pending ? '…' : 'REFUND'}
        </button>
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

    const refund = () =>
        start(async () => {
            if (
                !confirm(
                    `Refund @${handle}'s paid order in FULL to the original payment method and cancel it? This is logged.`,
                )
            ) {
                return;
            }
            try {
                const res = await adminRefundRsvpAction(eventId, profileId);
                if (!res.ok) return alert('Refund failed: ' + res.error);
                router.refresh();
            } catch (e: any) {
                alert('Refund failed: ' + (e?.message ?? 'unknown'));
            }
        });

    const remove = () =>
        start(async () => {
            if (!confirm(`Remove @${handle}'s RSVP from this event? This is logged.`)) return;
            try {
                const res = await adminRemoveRsvpAction(eventId, profileId);
                if (!res.ok) return alert('Remove failed: ' + res.error);
                router.refresh();
            } catch (e: any) {
                alert('Remove failed: ' + (e?.message ?? 'unknown'));
            }
        });

    return paid ? (
        <button className="admin-action-btn danger" disabled={pending} onClick={refund}>
            {pending ? '…' : 'REFUND'}
        </button>
    ) : (
        <button className="admin-action-btn muted" disabled={pending} onClick={remove}>
            {pending ? '…' : 'REMOVE'}
        </button>
    );
}
