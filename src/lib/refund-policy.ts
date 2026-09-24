/**
 * Paid-event refund/cancellation policy — single source of truth for both the
 * cutoff math and the human copy shown across every paid-event surface.
 *
 * Ethan's ruling (2026-09-24): full refund if cancelled more than 72 hours
 * before the event start; no refunds within 72 hours; no ticket transfers; a
 * member cannot release a confirmed paid spot themselves inside the window —
 * that has to go through a refund. If the HOST cancels the event, everyone
 * gets a full refund automatically, regardless of the window.
 *
 * DB contract (migration 20260924_077_paid_event_refund_policy.sql, APPLIED
 * 2026-09-24 06:45Z to rollout/db):
 *   events.reservation_policy->>'refund_cutoff_hours'   (int; 72 when absent/null)
 *   rollout.refund_cutoff_at(p_event uuid)  returns timestamptz  (start_at − cutoff hours; null for an unknown event)
 *   rollout.refund_window_open(p_event uuid) returns boolean     (now() < cutoff AND not cancelled; false for unknown/cancelled)
 *   rollout.cancel_rsvp raises P0001 'paid_spot: …' when the caller's row is
 *     going+confirmed AND (tier price_cents > 0 OR payment_ref IS NOT NULL) —
 *     a paid spot is never released by the member, only refunded.
 *
 * The RPCs are the source of truth once reachable (server code should prefer
 * them — see src/lib/event-refund.ts). This module's TS math is the fallback
 * for when the RPC can't be called (client components, or the RPC erroring)
 * and stays correct on its own: it mirrors the SQL exactly.
 */
import { formatEventTime } from './event-time';

export const DEFAULT_REFUND_CUTOFF_HOURS = 72;

export type ReservationPolicy = { refund_cutoff_hours?: number | string | null } | null | undefined;

/** The cutoff window in hours, from the event's reservation_policy (72 default). */
export function refundCutoffHours(policy?: ReservationPolicy): number {
    const raw = policy?.refund_cutoff_hours;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return Number.isFinite(n) && (n as number) > 0 ? (n as number) : DEFAULT_REFUND_CUTOFF_HOURS;
}

/** start_at − cutoff hours. Null when there is no start_at to compute from. */
export function refundCutoffAt(
    startAt: string | Date | null | undefined,
    policy?: ReservationPolicy,
): Date | null {
    if (!startAt) return null;
    const start = startAt instanceof Date ? startAt : new Date(startAt);
    if (Number.isNaN(start.getTime())) return null;
    const hours = refundCutoffHours(policy);
    return new Date(start.getTime() - hours * 60 * 60 * 1000);
}

/**
 * Is a self-service full refund still available right now? Mirrors
 * rollout.refund_window_open: false once the event is cancelled (a
 * host-cancelled event refunds everyone automatically instead — see
 * cancelEventAndRefundAll in event-refund.ts) or once `now` is past the
 * cutoff.
 */
export function refundWindowOpen(
    startAt: string | Date | null | undefined,
    policy?: ReservationPolicy,
    cancelledAt?: string | Date | null | undefined,
    now: Date = new Date(),
): boolean {
    if (cancelledAt) return false;
    const cutoff = refundCutoffAt(startAt, policy);
    if (!cutoff) return false;
    return now.getTime() < cutoff.getTime();
}

/** "Wed, Oct 7, 9:00 AM PDT" — the cutoff instant in the event's own zone. */
export function formatCutoff(cutoffAt: Date, timeZone?: string | null): string {
    return formatEventTime(cutoffAt, timeZone);
}

/**
 * The short line every paid-event surface shows: tier cards, checkout, the
 * confirmed-RSVP state, and the member's order page. Omit entirely for free
 * events — callers gate on that themselves (this module has no opinion on
 * whether a tier/event is paid).
 */
export function refundPolicyShortLine(
    startAt: string | Date | null | undefined,
    timeZone?: string | null,
    policy?: ReservationPolicy,
): string {
    const cutoff = refundCutoffAt(startAt, policy);
    const hours = refundCutoffHours(policy);
    const cutoffLabel = cutoff ? formatCutoff(cutoff, timeZone) : null;
    const windowSentence = cutoffLabel
        ? `Full refund until ${cutoffLabel}.`
        : `Full refund until ${hours} hours before the event.`;
    return `${windowSentence} No refunds within ${hours} hours of the start. Tickets are non-transferable.`;
}

/** The canonical link + label for every "policy" surface reference. */
export const REFUND_POLICY_PATH = '/policies/refunds';
export const REFUND_POLICY_LABEL = 'refund & cancellation policy';

/**
 * Full policy copy for the /policies/refunds page. Kept here (not inline in
 * the page) so the checkout checkbox / tier line / policy page can never
 * disagree about what the rule actually is.
 */
export type RefundPolicySection = { heading: string; paragraphs: string[] };

export function refundPolicyDoc(): { title: string; updated: string; body: RefundPolicySection[] } {
    return {
        title: 'REFUND & CANCELLATION POLICY',
        updated: '2026-09-24',
        body: [
            {
                heading: '1. Paid events',
                paragraphs: [
                    `If you cancel more than ${DEFAULT_REFUND_CUTOFF_HOURS} hours before a paid event's start time, you get a full refund.`,
                    `Inside ${DEFAULT_REFUND_CUTOFF_HOURS} hours of the start, cancellations are not refundable. This protects hosts who have already committed to capacity, venues, and supplies on your behalf.`,
                    'Tickets are non-transferable — there is no way to hand a paid spot to someone else. If you can no longer attend inside the window, the spot is forfeited unless the host cancels the event (see below).',
                    `A confirmed paid spot cannot be released by tapping "not going." Cancelling a paid RSVP always goes through the "Cancel & get a full refund" flow on the event page, which is only offered before the ${DEFAULT_REFUND_CUTOFF_HOURS}-hour cutoff.`,
                ],
            },
            {
                heading: '2. If the host cancels',
                paragraphs: [
                    'If a host cancels a paid event — for any reason, at any time — every ticket holder is refunded in full, automatically, regardless of how close to the start it is.',
                    'Today this runs as soon as the host cancels through their event tools; refunds land back on the original payment method and Stripe sends its own refund receipt by email.',
                ],
            },
            {
                heading: '3. How to cancel',
                paragraphs: [
                    'Open the event page and, under your confirmed spot, tap "Cancel & get a full refund." You will see the exact amount before you confirm.',
                    `This option is only available before the ${DEFAULT_REFUND_CUTOFF_HOURS}-hour cutoff shown on the event page. After that, cancelling forfeits the ticket.`,
                    'The same option is available from the Rollout app on your ticket for the event.',
                ],
            },
            {
                heading: '4. Free events',
                paragraphs: [
                    'Free RSVPs are not affected by this policy — you can RSVP or cancel a free "going" at any time before the event, the same as always.',
                ],
            },
            {
                heading: '5. Store purchases',
                paragraphs: [
                    'This policy covers event tickets and paid RSVP tiers only. Merchandise and parts bought through a shop\'s storefront follow that shop\'s own store terms, shown at checkout on the store order.',
                ],
            },
            {
                heading: '6. Contact',
                paragraphs: [
                    'Questions about a specific refund: support@rollout.club. Include the event name and, if you have it, your order number.',
                ],
            },
        ],
    };
}
