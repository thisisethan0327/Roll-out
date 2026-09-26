import 'server-only';
/**
 * Multi-ticket event packages (migration 080, rollout.event_tickets +
 * RPCs) — the ONE module that calls those RPCs/table. Everything else
 * (checkout, event page, /me/orders, /me/event-tickets) imports from here,
 * never queries `event_tickets` or calls these RPCs directly.
 *
 * WHY this module exists: migration 080 is being built by a separate
 * (platform) session in parallel — see
 * C:\Users\Ethanc\Documents\rollout\docs\MULTI_TICKET_DESIGN_2026-09-24.md.
 * The contract can still move before it ships. Funnelling every call through
 * these typed wrappers means a signature change is a one-file fix, and the
 * feature gate below means NOTHING changes on production until both the env
 * flag AND the migration are live.
 *
 * GATING — multiTicketsEnabled():
 *   ROLLOUT_MULTI_TICKETS === "1"  AND  the reserve_tickets() RPC exists.
 * The RPC-existence probe is a read-only catalog query (never calls the RPC
 * itself — reserve_tickets has side effects), cached for the life of the
 * process so steady state is one query, not one per request. A missing
 * function (migration not applied yet) resolves to `false`, so flipping the
 * env var alone can never crash the site ahead of the DB side landing.
 *
 * CONTRACT (FINAL, from the drafted migration 080 — 2026-09-24. Supersedes
 * the "Amendments accepted" section of the design doc, which was the
 * mid-flight draft):
 *
 *   reserve_tickets(p_event uuid, p_tier uuid, p_attendees jsonb)
 *     attendees = [{name, email, size}], 1..5. Seat 1's email is FORCED to
 *     the caller's own auth email server-side — this module re-stamps it
 *     before calling, but the RPC is the actual enforcement. Re-calling
 *     replaces the caller's previous hold (no separate "cancel hold" step
 *     needed to retry with different seats/quantity).
 *     →   {state:'held', hold_id, expires_at, event_id, tier_id,
 *          tickets:[{id,seat,name,email,size,spot_no}]}
 *       | {state:'invalid', detail:{field:'attendees'|'count'|'tier'|'name'
 *             |'email'|'size'|'attendee', seat?}}
 *       | {state:'duplicate_email', detail:{seat, reason:'in_order'
 *             |'already_ticketed'|'already_going'}}
 *       | {state:'full'|'tier_full', detail:{spots_left}}
 *       | {state:'closed'}
 *       | {state:'auth', detail?:{reason:'email_required'}}
 *
 *   confirm_ticket_payment(p_hold_id, p_order_id) — SERVICE-ONLY (backend's
 *     order.placed subscriber). The web app never calls this.
 *
 *   ticket_refund_quote(p_ticket uuid)
 *     Buyer only. Seat 1 IS quotable now (unlike the earlier draft) —
 *     is_whole_order:true and amount_cents is what's LEFT after any earlier
 *     per-ticket refunds already ate into the payment, NOT the order's
 *     original total. The whole-order "Cancel & refund" path (seat 1) MUST
 *     quote first and refund exactly that amount — refunding the full
 *     original total on a partially-refunded payment is an over-refund and
 *     Medusa refuses it (see cancelPaidRsvpAndRefund in event-refund.ts,
 *     and refundAndCancelEventOrder's new amountCents param in
 *     medusa-admin.ts).
 *     →   {state:'ok', amount_cents, currency, is_whole_order, order_id,
 *          ticket_id, seat, tickets}
 *       | {state:'forbidden'|'already'|'not_confirmed'|'no_amount'|'not_found'}
 *       | {state:'window_closed', cutoff_at}
 *
 *   cancel_ticket(p_ticket uuid, p_refund_ref text) — buyer only, idempotent
 *     on refund_ref.
 *     →   {state:'cancelled', freed, refund_cents, attendee_email,
 *          attendee_name, promoted}
 *       | {state:'already'|'whole_order'|'not_confirmed'|'forbidden'
 *             |'invalid'|'not_found'}
 *
 *   claim_my_tickets() → {state:'ok'|'auth', claimed, skipped} — best-effort,
 *     called after sign-in (requireConsumer).
 *
 *   my_tickets() → one row per ticket the caller can see (their own seat as
 *     an attendee, or every seat in their own order as the buyer):
 *     {ticket_id, event_id, event_title, start_at, seat, attendee_name,
 *      sweater_size, status, spot_no, checked_in, is_buyer, buyer_name,
 *      order_id, attendees?}. `attendees` — [{ticket_id, seat,
 *      attendee_name, attendee_email, sweater_size, status, spot_no,
 *      claimed, refund_cents}] — is present ONLY on the buyer's OWN seat-1
 *      row (privacy rule: an attendee's row never carries other attendees'
 *      names/emails).
 *
 *   reserve_spot(p_event, p_tier) — the EXISTING free/single-seat RPC —
 *     gains two outcomes once migration 080 lands (returned regardless of
 *     this module's feature flag, since reserve_spot itself isn't gated):
 *       {state:'confirmed', ticket_id, ...}  — the caller already had a
 *         ticket bought FOR their email by someone else, and reserve_spot
 *         auto-claimed it into a real RSVP.
 *       {state:'ticket_pending'}  — the caller has a ticket on someone
 *         else's order that's still HELD (buyer hasn't paid yet), so their
 *         own reserve attempt can't confirm anything until that resolves.
 *     Handled in event/[id]/actions.ts's setRsvp/startPackageCheckout and
 *     surfaced in TiersSection.tsx's copy — see RsvpState's 'ticket_pending'.
 *
 *   cancel_order_tickets(p_order_id) — backend-only (order.canceled),
 *     released automatically when the whole-order refund path runs. Never
 *     called from the web app directly.
 *
 *   host_check_in_ticket(p_ticket uuid) — host/door tooling, no web UI in
 *     this lane.
 *
 * Ticket status vocabulary: held | confirmed | cancelled | expired.
 */
import { getConsumerProfile, getRolloutMemberClient } from './consumer';
import { getSupabaseAdmin } from './supabase/admin';
import {
    MAX_TICKETS_PER_ORDER,
    SWEATER_SIZES,
    type SweaterSize,
    type TicketAttendeeInput,
    sizeLabel,
    formatCents,
} from './event-tickets-shared';

// Re-exported so every existing server-side import path (`@/lib/event-tickets`)
// keeps working unchanged — only the NEW client import (TicketAttendeesForm.tsx)
// needs to reach into event-tickets-shared.ts directly (see that file's doc
// comment for why the split exists).
export { MAX_TICKETS_PER_ORDER, SWEATER_SIZES, sizeLabel, formatCents };
export type { SweaterSize, TicketAttendeeInput };

export type ReserveTicketsTicket = {
    id: string;
    seat: number;
    name: string;
    email: string;
    size: string;
    spotNo: number | null;
};

export type ReserveTicketsResult =
    | {
          ok: true;
          holdId: string;
          expiresAt: string;
          eventId: string | null;
          tierId: string | null;
          tickets: ReserveTicketsTicket[];
      }
    | {
          ok: false;
          error: string;
          /** The RPC's raw {state} — 'full' | 'tier_full' | 'duplicate_email' |
           *  'closed' | 'auth' | 'invalid', when the RPC itself returned a
           *  recognized failure (absent on an RPC/network error). Lets a
           *  caller (e.g. the app's /api/app/event-checkout/start route) map
           *  onto the documented error codes without re-parsing `error`. */
          state?: string;
          /** Present only on state:'duplicate_email' — the 1-based seat. */
          seat?: number;
      };

export type TicketRefundQuote = {
    amountCents: number;
    currency: string | null;
    orderId: string | null;
    ticketId: string;
    seat: number;
    isWholeOrder: boolean;
    /** Total tickets on the order, when the RPC includes it (display only). */
    ticketsCount: number | null;
};

export type TicketRefundFailState =
    | 'in_progress'
    | 'forbidden'
    | 'already'
    | 'not_confirmed'
    | 'no_amount'
    | 'not_found'
    | 'window_closed'
    | 'error';

/**
 * Shared shape for BOTH ticket_refund_quote (read-only) and
 * ticket_refund_begin (quote + takes the refund lock). Every caller branches
 * on `state`, never on the message text, so the API route can tell
 * 'in_progress' apart from a hard failure without string-matching.
 */
export type TicketRefundQuoteResult =
    | { ok: true; state: 'ok'; quote: TicketRefundQuote }
    | { ok: false; state: TicketRefundFailState; error: string; cutoffAt?: string | null; since?: string | null };

export type CancelTicketResult =
    | {
          ok: true;
          state: 'cancelled' | 'already';
          freed: boolean;
          refundCents: number | null;
          attendeeEmail: string | null;
          attendeeName: string | null;
          promoted: boolean;
      }
    | { ok: false; error: string };

export type MyTicketAttendee = {
    ticketId: string;
    seat: number;
    name: string;
    email: string | null;
    size: string | null;
    status: string;
    spotNo: number | null;
    claimed: boolean;
    refundCents: number | null;
};

export type MyTicketRow = {
    ticketId: string;
    eventId: string;
    eventTitle: string | null;
    startAt: string | null;
    seat: number;
    attendeeName: string;
    /** Only present on rows the caller is entitled to see the email for —
     *  their own row, or every row when they're the buyer. */
    attendeeEmail: string | null;
    sweaterSize: string | null;
    status: string;
    spotNo: number | null;
    checkedIn: boolean;
    /** True once this seat's attendee_profile_id is set (claimed via sign-in). */
    claimed: boolean;
    refundCents: number | null;
    refundInProgress: boolean;
    isBuyer: boolean;
    buyerName: string | null;
    /** Null on an attendee's own row (my_tickets() privacy rule) — only the
     *  buyer's rows carry the order id. */
    orderId: string | null;
    /** ONE ROW PER TICKET — my_tickets() does not group by order. This
     *  nested list exists only on the buyer's own SEAT-1 row (a convenience
     *  summary of the whole order); every other row (including the buyer's
     *  own seats 2..N) has it null. Don't rely on it for occupancy/rendering
     *  — group the flat row list yourself (see myTicketsForEvent/ticketsForOrder). */
    attendees: MyTicketAttendee[] | null;
};

// ── feature gate ─────────────────────────────────────────────────────────
let probePromise: Promise<boolean> | null = null;

/**
 * Read-only existence probe: calls my_tickets() with the SERVICE-ROLE client
 * (no user JWT, so current_profile_id() resolves to nothing and the RPC just
 * returns zero rows for "nobody") — never reserve_tickets, which has side
 * effects. getSupabaseAdmin() is already pinned to the `rollout` schema (see
 * lib/supabase/admin.ts), so this is exactly the call a real caller makes,
 * just as an anonymous one. PostgREST returns PGRST202 (function not found in
 * schema cache) when migration 080 hasn't landed yet — that, or any other
 * error, resolves to "disabled" rather than propagating.
 */
async function probeReserveTicketsRpc(): Promise<boolean> {
    try {
        const admin = getSupabaseAdmin();
        const { error } = await admin.rpc('my_tickets');
        if (error) {
            if (error.code !== 'PGRST202') {
                console.error('[event-tickets] multiTicketsEnabled probe failed (treating as disabled):', error.message);
            }
            return false;
        }
        return true;
    } catch (e) {
        console.error('[event-tickets] multiTicketsEnabled probe threw (treating as disabled):', (e as any)?.message ?? e);
        return false;
    }
}

/**
 * Multi-ticket packages are live only when BOTH the env flag is set AND the
 * migration 080 RPC actually exists — so setting the env var ahead of the DB
 * migration landing is a safe no-op, never a crash. Cached per process
 * (the probe result can't change without a redeploy anyway).
 */
export async function multiTicketsEnabled(): Promise<boolean> {
    if (process.env.ROLLOUT_MULTI_TICKETS !== '1') return false;
    if (!probePromise) probePromise = probeReserveTicketsRpc();
    try {
        return await probePromise;
    } catch {
        return false;
    }
}

// ── RPC wrappers ─────────────────────────────────────────────────────────

/**
 * Turn a reserve_tickets failure {state, detail} into one plain-language
 * message. Uses the ORIGINAL attendees input (not anything the RPC echoes
 * back) to name the actual email in a duplicate_email message — the RPC's
 * detail only carries a seat number, not the address itself.
 */
function describeReserveFailure(data: any, attendees: TicketAttendeeInput[]): string {
    const state = (data?.state as string | undefined) ?? '';
    const detail = (data?.detail ?? {}) as Record<string, unknown>;
    const seat = typeof detail.seat === 'number' ? detail.seat : undefined;
    const seatEmail = seat != null ? attendees[seat - 1]?.email ?? null : null;
    const who = seat === 1 ? 'Your' : seat != null ? `Seat ${seat}'s` : 'That';

    if (state === 'invalid') {
        switch (detail.field) {
            case 'attendees':
                return 'Add at least one attendee.';
            case 'count':
                return `Between 1 and ${MAX_TICKETS_PER_ORDER} tickets.`;
            case 'tier':
                return 'That tier is not available. Refresh and try again.';
            case 'name':
                return `${who} name is required.`;
            case 'email':
                return `${who} email doesn't look right.`;
            case 'size':
                return `${who} sweater size is required.`;
            case 'attendee':
                return `Check ${seat != null ? `seat ${seat}'s` : 'the attendee'} details and try again.`;
            default:
                return 'Check the attendee details and try again.';
        }
    }
    if (state === 'size_sold_out') {
        // 086: per-size sweater stock on the tier.
        const size = typeof detail.size === 'string' ? detail.size : 'That size';
        const left = typeof detail.remaining === 'number' ? detail.remaining : 0;
        return left > 0
            ? `Only ${left} ${size} left — change ${seat != null ? `seat ${seat}'s` : 'a'} size.`
            : `${size} is sold out — pick another size${seat != null ? ` for seat ${seat}` : ''}.`;
    }
    if (state === 'duplicate_email') {
        const label = seat === 1 ? 'Your email' : seatEmail ?? who + ' email';
        const reason = detail.reason;
        if (reason === 'in_order') return `${label} is used twice in this order.`;
        if (reason === 'already_ticketed') return `${label} already has a ticket for this event.`;
        if (reason === 'already_going') return `${label} is already going to this event.`;
        return `${label} can't be used for this ticket.`;
    }
    if (state === 'full' || state === 'tier_full') {
        const spotsLeft = typeof detail.spots_left === 'number' ? detail.spots_left : null;
        const noun = state === 'tier_full' ? 'tier' : 'meet';
        if (spotsLeft != null && spotsLeft > 0) return `Only ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left — lower the ticket count.`;
        return state === 'tier_full' ? 'That tier just sold out.' : `This ${noun} is at capacity.`;
    }
    if (state === 'closed') return 'RSVPs are closed for this meet.';
    if (state === 'auth') {
        if (detail.reason === 'email_required') return 'Add an email to your account before reserving tickets.';
        return 'Sign in to reserve tickets.';
    }
    return "Couldn't reserve those tickets — try again.";
}

/**
 * Cookie-free core of reserveTickets: takes the rollout-member client
 * explicitly (RLS-scoped either to the SSR cookie session or, for the mobile
 * app, to a bearer token via getRolloutMemberClientForToken in lib/consumer.ts)
 * instead of resolving one from cookies itself. reserveTickets() below is the
 * cookie-session wrapper every existing web caller keeps using unchanged.
 */
export async function reserveTicketsWithClient(
    // Loosely typed on purpose — the caller may be either
    // getRolloutMemberClient()'s cookie-scoped client or
    // getRolloutMemberClientForToken()'s bearer-scoped one (lib/consumer.ts);
    // both are `rollout`-schema-scoped anon clients, just resolved differently.
    member: any,
    eventId: string,
    tierId: string,
    attendees: TicketAttendeeInput[],
): Promise<ReserveTicketsResult> {
    if (attendees.length < 1 || attendees.length > MAX_TICKETS_PER_ORDER) {
        return { ok: false, error: `Between 1 and ${MAX_TICKETS_PER_ORDER} tickets.` };
    }
    const { data, error } = await member.rpc('reserve_tickets', {
        p_event: eventId,
        p_tier: tierId,
        p_attendees: attendees,
    });
    if (error) {
        console.error('[event-tickets] reserve_tickets RPC failed:', error.message);
        return { ok: false, error: "Couldn't reserve those tickets — try again." };
    }
    const state = (data as any)?.state as string | undefined;
    if (state === 'held') {
        const rawTickets = ((data as any).tickets ?? []) as any[];
        return {
            ok: true,
            holdId: (data as any).hold_id,
            expiresAt: (data as any).expires_at,
            eventId: (data as any).event_id ?? eventId,
            tierId: (data as any).tier_id ?? tierId,
            tickets: rawTickets.map((t) => ({
                id: t.id,
                seat: Number(t.seat ?? 0),
                name: t.name ?? '',
                email: t.email ?? '',
                size: t.size ?? '',
                spotNo: t.spot_no != null ? Number(t.spot_no) : null,
            })),
        };
    }
    const failState = (data as any)?.state as string | undefined;
    const failSeat = typeof (data as any)?.detail?.seat === 'number' ? (data as any).detail.seat : undefined;
    return { ok: false, error: describeReserveFailure(data, attendees), state: failState, seat: failSeat };
}

/**
 * Reserve N seats (1..5) for a tiered/paid event. Seat 1's email is stamped
 * to the caller's own account email here (defence in depth — the RPC forces
 * it server-side regardless) so a client-tampered seat 1 can never reach the
 * RPC with a different address. Cookie-session wrapper around
 * reserveTicketsWithClient — see that function for the actual RPC call.
 */
export async function reserveTickets(
    eventId: string,
    tierId: string,
    attendees: TicketAttendeeInput[],
): Promise<ReserveTicketsResult> {
    const member = await getRolloutMemberClient();
    return reserveTicketsWithClient(member, eventId, tierId, attendees);
}

const REFUND_STATE_MESSAGES: Record<string, string> = {
    forbidden: 'Only the buyer can refund this ticket.',
    already: 'This ticket has already been cancelled.',
    not_confirmed: 'This ticket is not confirmed yet.',
    no_amount: 'Nothing left to refund on this ticket.',
    not_found: 'Ticket not found.',
    in_progress: 'A refund for this ticket is already in progress.',
};
const KNOWN_REFUND_FAIL_STATES = new Set<TicketRefundFailState>([
    'forbidden',
    'already',
    'not_confirmed',
    'no_amount',
    'not_found',
    'in_progress',
]);

function parseRefundQuoteLike(data: any, ticketId: string): TicketRefundQuoteResult {
    const state = (data?.state as string | undefined) ?? '';
    if (state === 'ok') {
        const d = data;
        return {
            ok: true,
            state: 'ok',
            quote: {
                amountCents: Number(d.amount_cents ?? 0),
                currency: d.currency ?? null,
                orderId: d.order_id ?? null,
                ticketId: d.ticket_id ?? ticketId,
                seat: Number(d.seat ?? 0),
                isWholeOrder: Boolean(d.is_whole_order),
                ticketsCount: d.tickets != null ? Number(d.tickets) : null,
            },
        };
    }
    if (state === 'window_closed') {
        return {
            ok: false,
            state: 'window_closed',
            error: 'Non-refundable within the cancellation window.',
            cutoffAt: data?.cutoff_at ?? null,
        };
    }
    if (KNOWN_REFUND_FAIL_STATES.has(state as TicketRefundFailState)) {
        const s = state as TicketRefundFailState;
        return { ok: false, state: s, error: REFUND_STATE_MESSAGES[s], since: data?.since ?? null };
    }
    return { ok: false, state: 'not_found', error: 'This ticket is not eligible for a refund right now.' };
}

/**
 * Read-only refund quote for one ticket. Buyer only. Seat 1 IS quotable
 * (is_whole_order true, amount = what's left after any earlier per-ticket
 * refunds) — see the module doc comment. Takes NO lock — use
 * beginTicketRefund() right before actually moving money.
 */
export async function ticketRefundQuote(ticketId: string): Promise<TicketRefundQuoteResult> {
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('ticket_refund_quote', { p_ticket: ticketId });
    if (error) return { ok: false, state: 'error', error: error.message };
    return parseRefundQuoteLike(data, ticketId);
}

/**
 * Same quote, but TAKES the per-ticket refund lock — a concurrent second
 * begin on the same ticket comes back {state:'in_progress'} instead of a
 * second quote. Callers that are about to actually move money (the
 * cancel-refund API route) must call this, not ticketRefundQuote, and must
 * release the lock with abortTicketRefund() if the refund POST itself
 * definitively fails (never on an ambiguous "could not confirm" result —
 * that stays locked for support to sort out by hand).
 */
export async function beginTicketRefund(ticketId: string): Promise<TicketRefundQuoteResult> {
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('ticket_refund_begin', { p_ticket: ticketId });
    if (error) return { ok: false, state: 'error', error: error.message };
    return parseRefundQuoteLike(data, ticketId);
}

/** Releases a refund lock taken by beginTicketRefund() — only when the refund itself definitively never happened. */
export async function abortTicketRefund(
    ticketId: string,
): Promise<{ ok: true; state: 'released' | 'noop' } | { ok: false; error: string }> {
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('ticket_refund_abort', { p_ticket: ticketId });
    if (error) return { ok: false, error: error.message };
    const state = (data as any)?.state as string | undefined;
    if (state === 'released' || state === 'noop') return { ok: true, state };
    return { ok: false, error: state === 'forbidden' ? 'Only the buyer can release this refund lock.' : 'Could not release the refund lock.' };
}

const CANCEL_TICKET_MESSAGES: Record<string, string> = {
    whole_order: "This is the buyer's own ticket — cancel the whole order instead.",
    not_confirmed: 'This ticket is not confirmed.',
    forbidden: 'Only the buyer can cancel this ticket.',
    invalid: 'Invalid ticket.',
    not_found: 'Ticket not found.',
};

/** Buyer-only, idempotent on refund_ref. Call ONLY after the refund landed. */
export async function cancelTicket(ticketId: string, refundRef: string): Promise<CancelTicketResult> {
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('cancel_ticket', {
        p_ticket: ticketId,
        p_refund_ref: refundRef,
    });
    if (error) return { ok: false, error: error.message };
    const state = (data as any)?.state as string | undefined;
    if (state === 'cancelled' || state === 'already') {
        const d = data as any;
        return {
            ok: true,
            state,
            freed: Boolean(d.freed),
            refundCents: d.refund_cents != null ? Number(d.refund_cents) : null,
            attendeeEmail: d.attendee_email ?? null,
            attendeeName: d.attendee_name ?? null,
            promoted: Boolean(d.promoted),
        };
    }
    return { ok: false, error: CANCEL_TICKET_MESSAGES[state ?? ''] ?? 'Could not cancel this ticket.' };
}

/**
 * Best-effort claim: called after the member's session/profile resolves on
 * the server (e.g. in requireConsumer). Never throws — a claim failure must
 * never block sign-in or any /me page from rendering. Returns quietly on
 * {state:'auth'} (no session) or any RPC error — there's nothing actionable
 * to surface from a background hook.
 */
export async function claimMyTicketsBestEffort(): Promise<void> {
    if (!(await multiTicketsEnabled())) return;
    try {
        const me = await getConsumerProfile();
        if (!me) return;
        const member = await getRolloutMemberClient();
        const { error } = await member.rpc('claim_my_tickets');
        if (error) console.error('[event-tickets] claim_my_tickets RPC failed:', error.message);
    } catch (e) {
        console.error('[event-tickets] claim_my_tickets best-effort failed:', (e as any)?.message ?? e);
    }
}

function mapMyTicketRow(r: any): MyTicketRow {
    return {
        ticketId: r.ticket_id,
        eventId: r.event_id,
        eventTitle: r.event_title ?? null,
        startAt: r.start_at ?? null,
        seat: Number(r.seat ?? 0),
        attendeeName: r.attendee_name ?? '',
        attendeeEmail: r.attendee_email ?? null,
        sweaterSize: r.sweater_size ?? null,
        status: r.status ?? '',
        spotNo: r.spot_no != null ? Number(r.spot_no) : null,
        checkedIn: Boolean(r.checked_in),
        claimed: Boolean(r.claimed),
        refundCents: r.refund_cents != null ? Number(r.refund_cents) : null,
        refundInProgress: Boolean(r.refund_in_progress),
        isBuyer: Boolean(r.is_buyer),
        buyerName: r.buyer_name ?? null,
        orderId: r.order_id ?? null,
        attendees: Array.isArray(r.attendees)
            ? r.attendees.map((a: any) => ({
                  ticketId: a.ticket_id ?? a.id,
                  seat: Number(a.seat ?? 0),
                  name: a.attendee_name ?? a.name ?? '',
                  email: a.attendee_email ?? a.email ?? null,
                  size: a.sweater_size ?? a.size ?? null,
                  status: a.status ?? '',
                  spotNo: a.spot_no != null ? Number(a.spot_no) : null,
                  claimed: Boolean(a.claimed),
                  refundCents: a.refund_cents != null ? Number(a.refund_cents) : null,
              }))
            : null,
    };
}

/**
 * Cookie-free core of myTickets: takes the rollout-member client explicitly
 * (see reserveTicketsWithClient's doc comment for why) instead of resolving
 * one from cookies itself.
 */
export async function myTicketsWithClient(member: any): Promise<MyTicketRow[]> {
    if (!(await multiTicketsEnabled())) return [];
    const { data, error } = await member.rpc('my_tickets');
    if (error) {
        console.error('[event-tickets] my_tickets RPC failed:', error.message);
        return [];
    }
    return ((data as any[]) ?? []).map(mapMyTicketRow);
}

/** Every ticket the caller can see — as buyer (one row per seat in their order, with `attendees` on the seat-1 row) or as a claimed attendee (their own row + buyer name only). Cookie-session wrapper around myTicketsWithClient. */
export async function myTickets(): Promise<MyTicketRow[]> {
    const member = await getRolloutMemberClient();
    return myTicketsWithClient(member);
}

/** Tickets for one order — used by /me/orders/[id]'s ATTENDEES table. Buyer-only (my_tickets already scopes to the caller; filtered client-side to this order). */
export async function ticketsForOrder(orderId: string): Promise<MyTicketRow[]> {
    if (!orderId) return [];
    const rows = await myTickets();
    return rows.filter((r) => r.orderId === orderId);
}

/** Tickets the signed-in member holds/bought/claimed for one event — feeds the "YOU'RE IN · N TICKETS" list on the public event page. */
export async function myTicketsForEvent(eventId: string): Promise<MyTicketRow[]> {
    const rows = await myTickets();
    return rows.filter((r) => r.eventId === eventId);
}

/** Cookie-free equivalent of myTicketsForEvent, for the mobile app's
 *  /api/app/event-checkout/complete route (RLS-scoped to the caller's bearer
 *  token via getRolloutMemberClientForToken). */
export async function myTicketsForEventWithClient(member: any, eventId: string): Promise<MyTicketRow[]> {
    const rows = await myTicketsWithClient(member);
    return rows.filter((r) => r.eventId === eventId);
}
