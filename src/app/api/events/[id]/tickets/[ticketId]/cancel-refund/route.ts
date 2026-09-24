/**
 * POST /api/events/[id]/tickets/[ticketId]/cancel-refund — multi-ticket
 * packages (feature-gated), buyer-only "Cancel & refund" for ONE ticket
 * that is not seat 1 (seat 1 leaves via the existing whole-order
 * cancelPaidRsvp flow — see event/[id]/actions.ts — because cancelling the
 * buyer's own seat cancels the whole order).
 *
 * Sequence (matches lib/event-refund.ts's pattern: refund BEFORE any DB
 * write moves the spot):
 *   1. ticket_refund_quote(ticket) — buyer-only, window-open, confirmed,
 *      seat >= 2 check all happen INSIDE this RPC; it also returns the
 *      order id and the share amount (DB-computed, floor((line+tax)/N),
 *      last remaining ticket gets the remainder).
 *   2. Partial refund of that amount on the order's captured payment
 *      (refundEventTicketShare — non-cancelling, the order and its other
 *      tickets stay alive).
 *   3. Verify the refund landed (done inside refundEventTicketShare).
 *   4. cancel_ticket(ticket, refund_ref) — idempotent on refund_ref, frees
 *      the seat, promotes the waitlist.
 *
 * Auth: cookie session only (getConsumerProfile) — this feature has no
 * mobile surface yet (design doc: "Phase 2, not needed for launch"), so
 * unlike /api/events/[id]/cancel-refund there is no bearer-token path here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConsumerProfile } from '@/lib/consumer';
import { multiTicketsEnabled, ticketRefundQuote, cancelTicket } from '@/lib/event-tickets';
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

    const quoted = await ticketRefundQuote(ticketId);
    if (!quoted.ok) {
        return NextResponse.json({ ok: false, error: quoted.error }, { status: 200 });
    }
    const { quote } = quoted;
    if (quote.seat === 1) {
        // Should never happen from the UI (seat 1 routes to the whole-order
        // flow), but never partially refund the buyer's own seat if it does.
        return NextResponse.json(
            { ok: false, error: 'The buyer\'s own ticket cancels the whole order — use "Cancel my order" instead.' },
            { status: 200 },
        );
    }
    if (!quote.orderId) {
        return NextResponse.json({ ok: false, error: 'No payment record found for this ticket.' }, { status: 200 });
    }

    const refund = await refundEventTicketShare(quote.orderId, quote.amountCents, { eventId: id });
    if (!refund.ok) {
        return NextResponse.json({ ok: false, error: refund.error }, { status: 200 });
    }
    const refundRef = refund.refundId ?? `${quote.orderId}:${ticketId}`;

    const result = await cancelTicket(ticketId, refundRef);
    if (!result.ok) {
        // The refund already landed — surface a support-able message rather
        // than a silent failure. Never re-attempt the refund here.
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
