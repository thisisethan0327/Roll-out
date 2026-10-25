/**
 * /me/event-tickets — multi-ticket packages (feature-gated). Every ticket
 * the signed-in member can see via my_tickets(): as a buyer (their own order's
 * tickets) or as a claimed attendee (their own seat only — my_tickets()'
 * privacy rule keeps other attendees' names/emails out of this list).
 *
 * Named /me/event-tickets rather than the design doc's plain "/me/tickets":
 * that path already exists in this app for wrap-shop SERVICE tickets (see
 * /me/tickets/page.tsx, loadMyTickets from me-data.ts) — an unrelated,
 * pre-existing feature. Reusing the path would have silently replaced it.
 * notFound()s outright when the feature is disabled, matching how a
 * not-yet-shipped route behaves anywhere else in this app.
 *
 * Glide: a list of rows (seat roundel · event · attendee and size · date ·
 * status chip · chevron).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Ticket } from 'lucide-react';
import { requireConsumer } from '@/lib/me-guard';
import { multiTicketsEnabled, myTickets as loadMyEventTickets, sizeLabel } from '@/lib/event-tickets';
import { fmtDay, statusVariant } from '../ui';
import { EmptyState, PageHead, StatusChip, statusLabel, toneFromVariant } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

export default async function EventTicketsPage() {
    await requireConsumer('/me/event-tickets');
    if (!(await multiTicketsEnabled())) notFound();

    const tickets = await loadMyEventTickets();

    return (
        <div className="glide glide-page gt-page--me">
            <PageHead title="Event tickets" />

            {tickets.length === 0 ? (
                <EmptyState
                    icon={<Ticket size={28} strokeWidth={1.5} />}
                    title="No event tickets yet"
                    action={
                        <Link href="/meets" className="g-sec">
                            Find a meet
                        </Link>
                    }
                />
            ) : (
                <ul className="gt-list">
                    {tickets.map((t) => (
                        <li key={t.ticketId}>
                            <Link href={`/event/${t.eventId}`} className="gt-li">
                                <span className="gt-seat-n gt-seat-n--lg" aria-hidden="true">
                                    {t.seat}
                                </span>
                                <span className="gt-li-t">
                                    <b>{t.eventTitle ?? 'Event'}</b>
                                    <small>
                                        Seat {t.seat} · {t.attendeeName || '—'} · Sweater {sizeLabel(t.sweaterSize)}
                                    </small>
                                    <small>
                                        {t.startAt ? fmtDay(t.startAt) : 'Date TBA'}
                                        {t.isBuyer ? ' · Your order' : t.buyerName ? ` · Ticket from ${t.buyerName}` : ''}
                                    </small>
                                </span>
                                {t.status ? (
                                    <span className="gt-li-r is-keep">
                                        <StatusChip label={statusLabel(t.status)} tone={toneFromVariant(statusVariant(t.status))} />
                                    </span>
                                ) : null}
                                <ChevronRight className="g-row-ch" size={20} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
