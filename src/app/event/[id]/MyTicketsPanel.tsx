'use client';
/**
 * "YOU'RE IN · N TICKETS" — multi-ticket packages (feature-gated). Lists the
 * signed-in member's own seats for this event (as buyer — every seat in
 * their order — or as a claimed attendee — just their own seat) with a
 * per-ticket "Cancel & refund" (two-click arm, matching PaidCancelControl in
 * TiersSection.tsx) for the BUYER while the refund window is open. Seat 1's
 * control cancels the whole order — it reuses the existing whole-order
 * cancelPaidRsvp action rather than the per-ticket API route, since
 * ticket_refund_quote() itself refuses seat 1 (see lib/event-tickets.ts).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MyTicketRow } from '@/lib/event-tickets';
import { cancelPaidRsvp } from './actions';
import { refundWindowOpen, refundPolicyShortLine, REFUND_POLICY_PATH, type ReservationPolicy } from '@/lib/refund-policy';

export function MyTicketsPanel({
    eventId,
    tickets,
    reservationPolicy,
    eventStartAt,
    eventTimeZone,
}: {
    eventId: string;
    tickets: MyTicketRow[];
    reservationPolicy: ReservationPolicy;
    eventStartAt: string | null;
    eventTimeZone: string | null;
}) {
    const sorted = [...tickets].sort((a, b) => a.seat - b.seat);
    const isBuyer = sorted.some((t) => t.isBuyer);
    const refundOpen = refundWindowOpen(eventStartAt, reservationPolicy);
    const policyLine = refundPolicyShortLine(eventStartAt, eventTimeZone, reservationPolicy);

    return (
        <div
            style={{
                width: '100%',
                maxWidth: 560,
                border: '1px solid var(--line-mid)',
                background: 'var(--bg-1)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
            }}
        >
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--gold)',
                }}
            >
                ✓ YOU&apos;RE IN · {sorted.length} TICKET{sorted.length === 1 ? '' : 'S'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sorted.map((t) => (
                    <TicketRow
                        key={t.ticketId}
                        eventId={eventId}
                        ticket={t}
                        canManage={isBuyer && t.isBuyer}
                        refundOpen={refundOpen}
                    />
                ))}
            </div>

            {isBuyer && sorted.length > 0 ? (
                <p className="text-muted" style={{ fontSize: 10, margin: 0, lineHeight: 1.5 }}>
                    {policyLine}{' '}
                    <Link href={REFUND_POLICY_PATH} className="text-link" style={{ color: 'inherit', textDecoration: 'underline' }}>
                        Full policy ›
                    </Link>
                </p>
            ) : null}
        </div>
    );
}

function statusColor(status: string): string {
    if (status === 'confirmed') return 'var(--gold)';
    if (status === 'cancelled' || status === 'expired') return 'var(--text-3)';
    return 'var(--text-2)';
}

function TicketRow({
    eventId,
    ticket,
    canManage,
    refundOpen,
}: {
    eventId: string;
    ticket: MyTicketRow;
    canManage: boolean;
    refundOpen: boolean;
}) {
    const router = useRouter();
    const [armed, setArmed] = useState(false);
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const canCancel = canManage && refundOpen && ticket.status === 'confirmed';

    const confirm = () => {
        setErr(null);
        startTransition(async () => {
            if (ticket.seat === 1) {
                // Cancelling the buyer's own seat cancels the whole order —
                // same path as the single-ticket "Cancel & get a full refund".
                const res = await cancelPaidRsvp(eventId);
                setArmed(false);
                if (res.ok) {
                    router.refresh();
                } else {
                    setErr(res.error);
                }
                return;
            }
            try {
                const res = await fetch(`/api/events/${eventId}/tickets/${ticket.ticketId}/cancel-refund`, {
                    method: 'POST',
                });
                const json = await res.json();
                setArmed(false);
                if (json?.ok) {
                    router.refresh();
                } else {
                    setErr(json?.error ?? 'Could not cancel this ticket.');
                }
            } catch {
                setArmed(false);
                setErr('Could not reach the server — try again.');
            }
        });
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                padding: '8px 0',
                borderTop: '1px solid var(--line)',
            }}
        >
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>
                    SEAT {ticket.seat} · {ticket.attendeeName || (ticket.isBuyer ? 'You' : '—')}
                    {!ticket.isBuyer && ticket.buyerName ? (
                        <span className="text-dim" style={{ fontSize: 11 }}> · Ticket from {ticket.buyerName}</span>
                    ) : null}
                </div>
                <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                    {ticket.sweaterSize ? `Sweater ${ticket.sweaterSize.toUpperCase()}` : 'No size on file'}
                    {' · '}
                    <span style={{ color: statusColor(ticket.status) }}>{ticket.status.toUpperCase()}</span>
                </div>
            </div>

            {canCancel ? (
                armed ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={confirm}
                            disabled={pending}
                            className="font-display"
                            style={{
                                padding: '8px 12px',
                                border: '1px solid var(--warn, #ff6b6b)',
                                background: 'transparent',
                                color: 'var(--warn, #ff6b6b)',
                                fontSize: 9,
                                letterSpacing: 'var(--track-wider)',
                                cursor: pending ? 'wait' : 'pointer',
                            }}
                        >
                            {pending ? 'REFUNDING…' : ticket.seat === 1 ? 'CONFIRM — CANCEL WHOLE ORDER' : 'CONFIRM — CANCEL & REFUND'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setArmed(false)}
                            disabled={pending}
                            className="font-display"
                            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 9, letterSpacing: 'var(--track-wider)', cursor: pending ? 'wait' : 'pointer', textDecoration: 'underline' }}
                        >
                            KEEP
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setArmed(true)}
                        disabled={pending}
                        className="font-display"
                        style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 9, letterSpacing: 'var(--track-wider)', cursor: 'pointer', textDecoration: 'underline', minHeight: 32 }}
                        title={ticket.seat === 1 ? 'Cancelling seat 1 cancels the whole order' : undefined}
                    >
                        {ticket.seat === 1 ? 'CANCEL WHOLE ORDER' : 'CANCEL & REFUND'}
                    </button>
                )
            ) : null}

            {err ? <span style={{ color: 'var(--warn, #ff6b6b)', fontSize: 10, width: '100%' }}>{err}</span> : null}
        </div>
    );
}
