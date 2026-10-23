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
 *
 * Glide: a seat list in the ticket panel (seat roundel · name · size and
 * status · cancel). The cancel paths are unchanged.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronRight, Clock, CircleX, Undo2 } from 'lucide-react';
import type { MyTicketRow } from '@/lib/event-tickets';
import { cancelPaidRsvp } from './actions';
import { refundWindowOpen, refundPolicyShortLine, REFUND_POLICY_PATH, type ReservationPolicy } from '@/lib/refund-policy';
import { isDeadTicketStatus } from '@/lib/event-tickets-shared';
import { ErrorLine, StatusChip, statusLabel } from '@/components/glide-tickets/parts';

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

    // Header counts only LIVE (confirmed) seats. With none left it must not
    // say "YOU'RE IN": a fully cancelled order reads ORDER CANCELLED (refund
    // emails and /me/orders carry the money story — a whole-order cancel
    // doesn't stamp refund_cents per seat, so we can't claim REFUNDED here).
    const live = sorted.filter((t) => t.status === 'confirmed').length;
    const allDead = sorted.length > 0 && sorted.every((t) => isDeadTicketStatus(t.status));
    const header =
        live > 0 ? (
            <>
                You&apos;re in · <span className="g-w">{live}</span> {live === 1 ? 'ticket' : 'tickets'}
            </>
        ) : allDead ? (
            'Order cancelled'
        ) : (
            <>
                Tickets pending · <span className="g-w">{sorted.length}</span>
            </>
        );

    return (
        <section className="gt-seats" aria-label="Your tickets">
            <div className="gt-seats-h">
                <span className="g-ic" aria-hidden="true">
                    {live > 0 ? <Check size={20} strokeWidth={2.4} /> : allDead ? <CircleX size={20} strokeWidth={2} /> : <Clock size={20} strokeWidth={2} />}
                </span>
                <b>{header}</b>
            </div>

            <div>
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

            {allDead ? (
                <div className="gt-seats-foot">
                    <p className="gt-fine">You can reserve again above while spots are open.</p>
                </div>
            ) : null}

            {isBuyer && sorted.length > 0 && !allDead ? (
                <div className="gt-seats-foot">
                    <p className="gt-fine">
                        {policyLine}{' '}
                        <Link href={REFUND_POLICY_PATH}>
                            Full policy
                            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                        </Link>
                    </p>
                </div>
            ) : null}
        </section>
    );
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
    const dead = isDeadTicketStatus(ticket.status);

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

    const who = ticket.attendeeName || (ticket.isBuyer ? 'You' : '—');

    return (
        <div className={`gt-seat${dead ? ' is-dead' : ''}`}>
            <span className="gt-seat-n" aria-hidden="true">
                {ticket.seat}
            </span>
            <span className="gt-seat-t">
                <b>
                    <span className="g-sr">Seat {ticket.seat}: </span>
                    {who}
                </b>
                <small>
                    {ticket.sweaterSize ? `Sweater ${ticket.sweaterSize.toUpperCase()}` : 'No size on file'}
                    {!ticket.isBuyer && ticket.buyerName ? ` · Ticket from ${ticket.buyerName}` : ''}
                </small>
            </span>
            <StatusChip label={statusLabel(ticket.status)} tone={ticket.status === 'confirmed' ? 'ok' : dead ? 'off' : 'wait'} />

            {canCancel ? (
                armed ? (
                    <span className="gt-armed">
                        <button type="button" className="gt-mini" data-armed="true" onClick={confirm} disabled={pending}>
                            {pending ? 'Refunding…' : ticket.seat === 1 ? 'Confirm: cancel whole order' : 'Confirm: cancel & refund'}
                        </button>
                        <button type="button" className="gt-mini gt-mini--line" onClick={() => setArmed(false)} disabled={pending}>
                            Keep
                        </button>
                    </span>
                ) : (
                    <button
                        type="button"
                        className="gt-mini gt-mini--line"
                        onClick={() => setArmed(true)}
                        disabled={pending}
                        title={ticket.seat === 1 ? 'Cancelling seat 1 cancels the whole order' : undefined}
                    >
                        <Undo2 size={16} strokeWidth={2} aria-hidden="true" />
                        {ticket.seat === 1 ? 'Cancel whole order' : 'Cancel & refund'}
                    </button>
                )
            ) : null}

            {err ? <ErrorLine>{err}</ErrorLine> : null}
        </div>
    );
}
