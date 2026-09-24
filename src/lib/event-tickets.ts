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
 * CONTRACT (agreed with the platform/DB session, 2026-09-24 — see the
 * "Amendments accepted" section of the design doc for the full history):
 *
 *   reserve_tickets(p_event uuid, p_tier uuid, p_attendees jsonb)
 *     attendees = [{name, email, size}], 1..5, seat 1 = caller's own email.
 *     → {state:'held', hold_id, expires_at, tickets:[{id,seat,name,email,size}]}
 *     | {state:'full'|'tier_full'|'duplicate_email'|'closed'|'auth'|'invalid', detail}
 *
 *   confirm_ticket_payment(p_hold_id, p_order_id) — SERVICE-ONLY (backend's
 *     order.placed subscriber). The web app never calls this.
 *
 *   ticket_refund_quote(p_ticket uuid)
 *     Buyer only, refund window open, ticket confirmed, seat >= 2 (seat 1
 *     goes through the existing whole-order refund path instead).
 *     → {amount_cents, order_id, ticket_id, seat, is_whole_order: false}
 *
 *   cancel_ticket(p_ticket uuid, p_refund_ref text)
 *     Buyer only; idempotent on refund_ref.
 *     → {state:'cancelled'|'already', freed: true}
 *
 *   claim_my_tickets() → {claimed: n} — best-effort, called after sign-in.
 *
 *   my_tickets() → rows:
 *     {ticket_id, event_id, event_title, start_at, seat, attendee_name,
 *      sweater_size, status, is_buyer, buyer_name, order_id,
 *      attendees?: [...] }  — `attendees` is present ONLY when is_buyer is
 *     true (privacy: an attendee sees their own ticket + the buyer's display
 *     name, never other attendees' names/emails).
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

export const MAX_TICKETS_PER_ORDER = 5;
export const SWEATER_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type SweaterSize = (typeof SWEATER_SIZES)[number];

export type TicketAttendeeInput = {
    name: string;
    email: string;
    size: SweaterSize;
};

export type ReserveTicketsError =
    | 'full'
    | 'tier_full'
    | 'duplicate_email'
    | 'closed'
    | 'auth'
    | 'invalid'
    | 'write';

export type ReserveTicketsResult =
    | {
          ok: true;
          holdId: string;
          expiresAt: string;
          tickets: { id: string; seat: number; name: string; email: string; size: string }[];
      }
    | { ok: false; error: ReserveTicketsError; detail?: string | null };

export type TicketRefundQuote = {
    amountCents: number;
    orderId: string | null;
    ticketId: string;
    seat: number;
    isWholeOrder: false;
};

export type CancelTicketResult =
    | { ok: true; state: 'cancelled' | 'already'; freed: boolean }
    | { ok: false; error: string };

export type MyTicketAttendee = {
    ticketId: string;
    seat: number;
    name: string;
    email: string | null;
    size: string | null;
    status: string;
};

export type MyTicketRow = {
    ticketId: string;
    eventId: string;
    eventTitle: string | null;
    startAt: string | null;
    seat: number;
    attendeeName: string;
    sweaterSize: string | null;
    status: string;
    isBuyer: boolean;
    buyerName: string | null;
    orderId: string | null;
    /** Only populated when isBuyer is true (my_tickets() privacy rule). */
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

function mapReserveError(raw: unknown): ReserveTicketsError {
    const s = String(raw ?? '').toLowerCase();
    if (s.includes('tier_full')) return 'tier_full';
    if (s === 'full') return 'full';
    if (s.includes('duplicate_email')) return 'duplicate_email';
    if (s.includes('closed')) return 'closed';
    if (s.includes('auth')) return 'auth';
    return 'invalid';
}

/**
 * Reserve N seats (1..5) for a tiered/paid event. Seat 1 must be the caller's
 * own name/email — callers should pass the signed-in member's profile as
 * attendees[0] rather than trusting client input for that seat.
 */
export async function reserveTickets(
    eventId: string,
    tierId: string,
    attendees: TicketAttendeeInput[],
): Promise<ReserveTicketsResult> {
    if (attendees.length < 1 || attendees.length > MAX_TICKETS_PER_ORDER) {
        return { ok: false, error: 'invalid', detail: 'Between 1 and 5 tickets.' };
    }
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('reserve_tickets', {
        p_event: eventId,
        p_tier: tierId,
        p_attendees: attendees,
    });
    if (error) {
        console.error('[event-tickets] reserve_tickets RPC failed:', error.message);
        return { ok: false, error: 'write', detail: error.message };
    }
    const state = (data as any)?.state as string | undefined;
    if (state === 'held') {
        const rawTickets = ((data as any).tickets ?? []) as any[];
        return {
            ok: true,
            holdId: (data as any).hold_id,
            expiresAt: (data as any).expires_at,
            tickets: rawTickets.map((t) => ({
                id: t.id,
                seat: Number(t.seat ?? 0),
                name: t.name ?? '',
                email: t.email ?? '',
                size: t.size ?? '',
            })),
        };
    }
    return { ok: false, error: mapReserveError(state), detail: (data as any)?.detail ?? null };
}

/** Buyer-only refund quote for a single non-seat-1 ticket. */
export async function ticketRefundQuote(ticketId: string): Promise<
    { ok: true; quote: TicketRefundQuote } | { ok: false; error: string }
> {
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('ticket_refund_quote', { p_ticket: ticketId });
    if (error) return { ok: false, error: error.message };
    if (!data || (data as any).amount_cents == null) {
        return { ok: false, error: 'This ticket is not eligible for a refund right now.' };
    }
    const d = data as any;
    return {
        ok: true,
        quote: {
            amountCents: Number(d.amount_cents),
            orderId: d.order_id ?? null,
            ticketId: d.ticket_id ?? ticketId,
            seat: Number(d.seat ?? 0),
            isWholeOrder: false,
        },
    };
}

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
        return { ok: true, state, freed: Boolean((data as any)?.freed) };
    }
    return { ok: false, error: 'Could not cancel this ticket.' };
}

/**
 * Best-effort claim: called after the member's session/profile resolves on
 * the server (e.g. in requireConsumer). Never throws — a claim failure must
 * never block sign-in or any /me page from rendering.
 */
export async function claimMyTicketsBestEffort(): Promise<void> {
    if (!(await multiTicketsEnabled())) return;
    try {
        const me = await getConsumerProfile();
        if (!me) return;
        const member = await getRolloutMemberClient();
        await member.rpc('claim_my_tickets');
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
        sweaterSize: r.sweater_size ?? null,
        status: r.status ?? '',
        isBuyer: Boolean(r.is_buyer),
        buyerName: r.buyer_name ?? null,
        orderId: r.order_id ?? null,
        attendees: Array.isArray(r.attendees)
            ? r.attendees.map((a: any) => ({
                  ticketId: a.ticket_id ?? a.id,
                  seat: Number(a.seat ?? 0),
                  name: a.name ?? a.attendee_name ?? '',
                  email: a.email ?? a.attendee_email ?? null,
                  size: a.size ?? a.sweater_size ?? null,
                  status: a.status ?? '',
              }))
            : null,
    };
}

/** Every ticket the caller can see — as buyer (with the full attendee list) or as a claimed attendee (their own row + buyer name only). */
export async function myTickets(): Promise<MyTicketRow[]> {
    if (!(await multiTicketsEnabled())) return [];
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('my_tickets');
    if (error) {
        console.error('[event-tickets] my_tickets RPC failed:', error.message);
        return [];
    }
    return ((data as any[]) ?? []).map(mapMyTicketRow);
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

export function sizeLabel(size: string | null | undefined): string {
    return size ? size.toUpperCase() : '—';
}

/** cents → "$160.00" (USD-only, matching the rest of the event checkout surface). */
export function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}
