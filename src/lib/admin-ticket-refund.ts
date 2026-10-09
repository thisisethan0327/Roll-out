import 'server-only';
/**
 * Refund ONE non-buyer seat of a multi-ticket order, as the PLATFORM (Part 2):
 * the service-role twin of /api/events/[id]/tickets/[ticketId]/cancel-refund.
 * Shared by the admin per-ticket REFUND (admin/events/[id]/host-actions.ts) and
 * the ban auto-refund job (lib/ban-refunds.ts, 'seat' rows).
 *
 * WHY THE SERVICE ROLE. ticket_refund_begin / cancel_ticket guard with
 * `auth.uid() is not null and purchaser is distinct from current_profile_id()`.
 * The service role (auth.uid() null) passes, and it is the only way to refund a
 * BANNED buyer's ticket (current_profile_id() is NULL for a banned caller).
 * Authorization is therefore the CALLER's job: requirePlatformAdmin() in the
 * admin action, and the admin-only action that starts the ban job.
 *
 * Lock rules are the cancel-refund route's, verbatim:
 *   1. ticket_refund_begin TAKES the per-ticket lock (a concurrent attempt gets
 *      'in_progress').
 *   2. refundEventTicketShare: non-cancelling partial refund, verified landed.
 *   3. Abort the lock ONLY on phase 'refused' | 'refund_failed' (nothing moved).
 *      On 'confirm_failed' the money may have moved: LEAVE the lock, report
 *      "needs manual check", never retry blindly.
 *   4. cancel_ticket(refund_ref): idempotent on refund_ref, frees the seat.
 *   5. notifyEventTicketCancelled, best-effort, after the cancel is confirmed.
 *
 * Admins are NOT bound by the member refund window for the WHOLE-ORDER path
 * (refundAndCancelEventOrder has no window check), but ticket_refund_begin still
 * applies refund_window_open to a seat >= 2 share. That comes back as
 * kind 'window_closed' so the caller can offer the whole-order refund instead.
 */
import { getSupabaseAdmin } from './supabase/admin';
import {
    abortTicketRefundWith,
    beginTicketRefundWith,
    cancelTicketWith,
} from './event-tickets';
import { notifyEventTicketCancelled, refundEventTicketShare } from './medusa-admin';

export type SeatRefundOutcome =
    | { ok: true; orderId: string; amountCents: number; refundRef: string }
    | {
          ok: false;
          kind:
              | 'not_refundable' // already / not confirmed / no amount / not found / in progress / other
              | 'window_closed' // seat >= 2 outside the refund window
              | 'whole_order' // seat 1: the buyer's own seat cancels the whole order
              | 'refund_failed' // nothing moved, lock released
              | 'confirm_failed' // money MAY have moved, lock left in place
              | 'cancel_failed'; // refund landed, ticket not released
          error: string;
          state?: string;
          orderId?: string | null;
          amountCents?: number;
      };

export async function refundSeatShareAsPlatform(ticketId: string, eventId: string): Promise<SeatRefundOutcome> {
    const svc = getSupabaseAdmin();

    const begun = await beginTicketRefundWith(svc, ticketId);
    if (!begun.ok) {
        return {
            ok: false,
            kind: begun.state === 'window_closed' ? 'window_closed' : 'not_refundable',
            state: begun.state,
            error: begun.error,
        };
    }
    const { quote } = begun;
    if (quote.seat === 1) {
        await abortTicketRefundWith(svc, ticketId);
        return {
            ok: false,
            kind: 'whole_order',
            error: "The buyer's own ticket cancels the whole order.",
            orderId: quote.orderId,
            amountCents: quote.amountCents,
        };
    }
    if (!quote.orderId) {
        await abortTicketRefundWith(svc, ticketId);
        return { ok: false, kind: 'not_refundable', error: 'No payment record found for this ticket.' };
    }

    const refund = await refundEventTicketShare(quote.orderId, quote.amountCents, { eventId });
    if (!refund.ok) {
        if (refund.phase === 'refused' || refund.phase === 'refund_failed') {
            await abortTicketRefundWith(svc, ticketId);
            return {
                ok: false,
                kind: 'refund_failed',
                error: refund.error ?? 'Refund failed.',
                orderId: quote.orderId,
                amountCents: quote.amountCents,
            };
        }
        // confirm_failed: leave the lock.
        return {
            ok: false,
            kind: 'confirm_failed',
            error: `Needs manual check: ${refund.error ?? 'refund could not be confirmed'}`,
            orderId: quote.orderId,
            amountCents: quote.amountCents,
        };
    }
    const refundRef = refund.refundId ?? `${quote.orderId}:${ticketId}`;

    const cancelled = await cancelTicketWith(svc, ticketId, refundRef);
    if (!cancelled.ok) {
        // The refund landed: never re-attempt it, never abort the lock.
        return {
            ok: false,
            kind: 'cancel_failed',
            error: `Refund succeeded but the ticket could not be released (${cancelled.error}).`,
            orderId: quote.orderId,
            amountCents: quote.amountCents,
        };
    }

    await notifyEventTicketCancelled(ticketId);
    return { ok: true, orderId: quote.orderId, amountCents: quote.amountCents, refundRef };
}
