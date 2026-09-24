/**
 * POST /api/events/[id]/tickets/[ticketId]/cancel-refund — multi-ticket
 * packages (feature-gated), buyer-only "Cancel & refund" for ONE ticket
 * that is not seat 1 (seat 1 leaves via the existing whole-order
 * cancelPaidRsvp flow — see event/[id]/actions.ts — because cancelling the
 * buyer's own seat cancels the whole order).
 *
 * Sequence (matches lib/event-refund.ts's pattern: refund BEFORE any DB
 * write moves the spot; locked via ticket_refund_begin, not the read-only
 * ticket_refund_quote, so two concurrent cancel clicks can't both refund):
 *   1. ticket_refund_begin(ticket) — buyer-only, window-open, confirmed,
 *      seat >= 2, TAKES the refund lock. A concurrent second attempt comes
 *      back {state:'in_progress'} instead of a second quote.
 *   2. Partial refund of that amount on the order's captured payment
 *      (refundEventTicketShare — non-cancelling, the order and its other
 *      tickets stay alive).
 *   3. Verify the refund landed (done inside refundEventTicketShare, which
 *      reports WHICH phase a failure happened in).
 *   4. cancel_ticket(ticket, refund_ref) — idempotent on refund_ref, frees
 *      the seat, promotes the waitlist.
 *
 * Lock release: abortTicketRefund() is called ONLY when refundEventTicketShare
 * reports phase 'refused' or 'refund_failed' — i.e. nothing was ever POSTed
 * to Medusa, or the POST itself came back non-2xx, so it's certain no money
 * moved. On phase 'confirm_failed' (POST succeeded but re-reading the
 * payment couldn't verify it landed) the lock is left in place on purpose —
 * the money may have moved, so a retry from this route must not run again;
 * that state needs a human to check the order and sort it out by hand.
 *
 * Auth: cookie session only (getConsumerProfile) — this feature has no
 * mobile surface yet (design doc: "Phase 2, not needed for launch"), so
 * unlike /api/events/[id]/cancel-refund there is no bearer-token path here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConsumerProfile } from '@/lib/consumer';
import { multiTicketsEnabled, beginTicketRefund, abortTicketRefund, cancelTicket } from '@/lib/event-tickets';
import { refundEventTicketShare } from '@/lib/medusa-admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; ticketId: string }> }) {
    const { id, ticketId } = await ctx.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(ticketId)) {
        return NextResponse.json({ ok: false, error: 'Invalid event or ticket.' }, { status: 400 });
    }

    if (!(await multiTicketsEnabled())) {
        return NextResponse.json({ ok: false, error: 'Not available.' }, { status: 404 });
    }

    const me = await getConsumerProfile();
    if (!me) {
        return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
    }

    const begun = await beginTicketRefund(ticketId);
    if (!begun.ok) {
        // Every branch here (in_progress, forbidden, already, not_confirmed,
        // window_closed, no_amount, not_found, error) already carries a
        // plain-language message from event-tickets.ts — nothing was ever
        // POSTed to Medusa on any of them, so there's no lock to release.
        return NextResponse.json({ ok: false, error: begun.error }, { status: 200 });
    }
    const { quote } = begun;
    if (quote.seat === 1) {
        // Should never happen from the UI (seat 1 routes to the whole-order
        // flow), but never partially refund the buyer's own seat if it does
        // — and release the lock ticket_refund_begin just took.
        await abortTicketRefund(ticketId);
        return NextResponse.json(
            { ok: false, error: 'The buyer\'s own ticket cancels the whole order — use "Cancel my order" instead.' },
            { status: 200 },
        );
    }
    if (!quote.orderId) {
        await abortTicketRefund(ticketId);
        return NextResponse.json({ ok: false, error: 'No payment record found for this ticket.' }, { status: 200 });
    }

    const refund = await refundEventTicketShare(quote.orderId, quote.amountCents, { eventId: id });
    if (!refund.ok) {
        // Only release the lock when it's certain no money moved.
        if (refund.phase === 'refused' || refund.phase === 'refund_failed') {
            await abortTicketRefund(ticketId);
        }
        return NextResponse.json({ ok: false, error: refund.error }, { status: 200 });
    }
    const refundRef = refund.refundId ?? `${quote.orderId}:${ticketId}`;

    const result = await cancelTicket(ticketId, refundRef);
    if (!result.ok) {
        // The refund already landed — surface a support-able message rather
        // than a silent failure. Never re-attempt the refund here, and never
        // abort the lock (the refund happened; the lock reflects that).
        return NextResponse.json(
            {
                ok: false,
                error: `Refund succeeded but the ticket could not be released automatically (${result.error}). Contact support@rollout.club.`,
            },
            { status: 200 },
        );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
}
