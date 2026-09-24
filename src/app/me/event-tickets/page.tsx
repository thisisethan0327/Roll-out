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
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import { multiTicketsEnabled, myTickets as loadMyEventTickets, sizeLabel } from '@/lib/event-tickets';
import { fmtDay, StatusPill, EmptyRow } from '../ui';

export const dynamic = 'force-dynamic';

export default async function EventTicketsPage() {
    await requireConsumer('/me/event-tickets');
    if (!(await multiTicketsEnabled())) notFound();

    const tickets = await loadMyEventTickets();

    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">EVENT TICKETS</div>
                    <div className="admin-page-sub text-dim">
                        Every event ticket tied to your account — bought, or claimed from a buyer.
                    </div>
                </div>
            </div>

            {tickets.length === 0 ? (
                <EmptyRow text="NO EVENT TICKETS YET" />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tickets.map((t) => (
                        <Link
                            key={t.ticketId}
                            href={`/event/${t.eventId}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0,1fr) auto',
                                gap: 12,
                                alignItems: 'center',
                                border: '1px solid var(--line)',
                                background: 'var(--bg-1)',
                                padding: 14,
                                textDecoration: 'none',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ color: 'var(--text)', fontSize: 14 }}>
                                    {t.eventTitle ?? 'Event'}
                                </div>
                                <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>
                                    SEAT {t.seat} · {t.attendeeName || '—'} · Sweater {sizeLabel(t.sweaterSize)}
                                </div>
                                <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                    {t.startAt ? fmtDay(t.startAt) : 'Date TBA'}
                                    {t.isBuyer ? ' · Your order' : t.buyerName ? ` · Ticket from ${t.buyerName}` : ''}
                                </div>
                            </div>
                            <StatusPill status={t.status} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
