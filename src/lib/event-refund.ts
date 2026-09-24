import 'server-only';
/**
 * Paid-event cancellation + refund orchestration — the ONE place that decides
 * "is a refund still allowed" and "go refund this order", shared by:
 *   - the member's own "Cancel & get a full refund" (event/[id]/actions.ts +
 *     api/events/[id]/cancel-refund/route.ts for the mobile app)
 *   - the host/shop-manager/platform-admin "cancel event & refund everyone"
 *   - the shop-console refund guard's belt-and-suspenders check
 *
 * Money movement itself (refund the payment, then cancel the order) lives in
 * lib/medusa-admin.ts's refundAndCancelEventOrder — this file is the policy +
 * permission layer on top of it.
 *
 * ORDER LOOKUP. Per the platform session (2026-09-24): do NOT search order
 * metadata. rollout.event_rsvps.payment_ref holds the Medusa ORDER id,
 * stamped by confirm_rsvp_payment on order.placed (migration
 * 20260814_052_event_paid_holds.sql, column comment). A confirmed paid row
 * with payment_ref = null is an anomaly (that function always stamps it) —
 * treated as a hard stop, never guessed at.
 *
 * WINDOW. migration 20260924_077_paid_event_refund_policy.sql (APPLIED
 * 2026-09-24 06:45Z) added rollout.refund_cutoff_at / refund_window_open —
 * used here as the PRIMARY source. The TS math in lib/refund-policy.ts is
 * kept as a fallback for resilience (an RPC hiccup should not be the reason a
 * refund silently fails), and mirrors the SQL exactly.
 */
import { getConsumerProfile } from './consumer';
import { getSupabaseAdmin } from './supabase/admin';
import { refundAndCancelEventOrder, getOrderEventMeta } from './medusa-admin';
import {
    refundCutoffAt as tsRefundCutoffAt,
    refundWindowOpen as tsRefundWindowOpen,
    DEFAULT_REFUND_CUTOFF_HOURS,
    type ReservationPolicy,
} from './refund-policy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOP_MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type EventCore = {
    id: string;
    host_id: string | null;
    shop_id: number | null;
    start_at: string | null;
    time_zone: string | null;
    reservation_policy: ReservationPolicy;
    cancelled_at: string | null;
    title: string | null;
};

async function loadEventCore(eventId: string): Promise<EventCore | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('events')
        .select('id, host_id, shop_id, start_at, time_zone, reservation_policy, cancelled_at, title')
        .eq('id', eventId)
        .maybeSingle();
    if (error) console.error('[event-refund] event load failed:', error.message);
    return (data as EventCore | null) ?? null;
}

/**
 * The refund cutoff instant, preferring the live RPC and falling back to the
 * TS calculation (same formula) if the RPC errors or the event can't be
 * loaded through it for some reason.
 */
export async function getRefundCutoffAt(eventId: string): Promise<Date | null> {
    const admin = getSupabaseAdmin();
    try {
        const { data, error } = await admin.rpc('refund_cutoff_at', { p_event: eventId });
        if (!error && data) {
            const d = new Date(data as string);
            if (!Number.isNaN(d.getTime())) return d;
        }
    } catch (e) {
        console.error('[event-refund] refund_cutoff_at RPC threw:', (e as any)?.message ?? e);
    }
    const ev = await loadEventCore(eventId);
    if (!ev) return null;
    return tsRefundCutoffAt(ev.start_at, ev.reservation_policy);
}

/**
 * Is a self-service refund still allowed right now? Preferring the live RPC
 * (which also folds in "is the event cancelled") and falling back to the TS
 * calculation against a freshly loaded event row.
 */
export async function getRefundWindowOpen(eventId: string): Promise<boolean> {
    const admin = getSupabaseAdmin();
    try {
        const { data, error } = await admin.rpc('refund_window_open', { p_event: eventId });
        if (!error && typeof data === 'boolean') return data;
    } catch (e) {
        console.error('[event-refund] refund_window_open RPC threw:', (e as any)?.message ?? e);
    }
    const ev = await loadEventCore(eventId);
    if (!ev) return false;
    return tsRefundWindowOpen(ev.start_at, ev.reservation_policy, ev.cancelled_at);
}

// ── member self-service: cancel a confirmed paid spot ───────────────────────

export type CancelPaidRsvpResult = { ok: true } | { ok: false; error: string };

/**
 * The member's own "Cancel & get a full refund", called by BOTH the web
 * server action and the mobile API route so the two can never disagree.
 * `profileId` is the CALLER's own profile — never accepted from the client
 * without having been resolved from their session first (see both callers).
 */
export async function cancelPaidRsvpAndRefund(
    eventId: string,
    profileId: string,
): Promise<CancelPaidRsvpResult> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'Invalid event.' };

    const windowOpen = await getRefundWindowOpen(eventId);
    if (!windowOpen) {
        return {
            ok: false,
            error: `Non-refundable within ${DEFAULT_REFUND_CUTOFF_HOURS} hours of the start.`,
        };
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_rsvps')
        .select('status, hold_state, payment_ref, tier_id')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .maybeSingle();
    if (error) {
        console.error('[event-refund] rsvp load failed:', error.message);
        return { ok: false, error: 'Could not load your RSVP.' };
    }
    const row = data as any;
    if (!row || row.status !== 'going' || row.hold_state !== 'confirmed') {
        return { ok: false, error: 'You do not have a confirmed spot on this event.' };
    }

    let tierPriceCents = 0;
    if (row.tier_id) {
        const { data: t } = await admin.from('event_tiers').select('price_cents').eq('id', row.tier_id).maybeSingle();
        tierPriceCents = Number((t as any)?.price_cents ?? 0);
    }
    const isPaid = tierPriceCents > 0 || row.payment_ref != null;
    if (!isPaid) {
        return {
            ok: false,
            error: 'This is a free RSVP — cancel it from the event page directly.',
        };
    }

    if (!row.payment_ref) {
        // TODO(event-refund): payment_ref is null on a confirmed PAID row.
        // confirm_rsvp_payment (migration 20260814_052) always stamps it on
        // order.placed, so this means the webhook never landed for this row
        // (or it predates the column). Refuse rather than guess which order
        // to refund — this needs a human to reconcile against Stripe/Medusa.
        return {
            ok: false,
            error: 'We could not find your payment record for this ticket — contact support@rollout.club and we will sort out the refund by hand.',
        };
    }

    const result = await refundAndCancelEventOrder(row.payment_ref, {
        eventId,
        eventProfileId: profileId,
    });
    if (!result.ok) return { ok: false, error: result.error ?? 'Refund failed.' };
    return { ok: true };
}

// ── host / shop-manager / platform-admin: cancel event + refund everyone ────

type PermissionResult = { ok: true; profileId: string } | { ok: false; error: string };

/** Host of a no-shop event, a manager+ of the hosting shop, or a platform admin. */
async function callerCanManageEvent(ev: EventCore): Promise<PermissionResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Sign in required.' };

    const admin = getSupabaseAdmin();
    const { data: padmin } = await admin
        .from('platform_admins')
        .select('profile_id')
        .eq('profile_id', me.profileId)
        .maybeSingle();
    if (padmin) return { ok: true, profileId: me.profileId };

    if (ev.shop_id == null) {
        if (ev.host_id === me.profileId) return { ok: true, profileId: me.profileId };
        return { ok: false, error: 'Only the host can cancel this event.' };
    }

    const { data: mem } = await admin
        .from('shop_memberships')
        .select('role')
        .eq('profile_id', me.profileId)
        .eq('shop_id', ev.shop_id)
        .maybeSingle();
    const role = (mem as any)?.role as string | undefined;
    if (role && SHOP_MANAGER_ROLES.has(role)) return { ok: true, profileId: me.profileId };
    return { ok: false, error: 'Only a shop manager can cancel this event.' };
}

export type EventRefundPreview = {
    /** Confirmed rows on a priced tier with a payment reference to refund. */
    paidCount: number;
    /** Best-effort total, in cents, from tiers' CURRENT price — an estimate
     *  for the confirmation dialog, not what will necessarily be refunded
     *  cent-for-cent if a tier's price changed after some of these bought in. */
    totalCents: number;
    currency: string | null;
};

/** Read-only preview for the host's confirmation dialog — no writes. */
export async function previewEventRefundAll(eventId: string): Promise<EventRefundPreview> {
    if (!UUID_RE.test(eventId)) return { paidCount: 0, totalCents: 0, currency: null };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('event_rsvps')
        .select('tier_id')
        .eq('event_id', eventId)
        .eq('status', 'going')
        .eq('hold_state', 'confirmed')
        .not('payment_ref', 'is', null);
    if (error || !data || data.length === 0) return { paidCount: 0, totalCents: 0, currency: null };

    const tierIds = Array.from(new Set((data as any[]).map((r) => r.tier_id).filter(Boolean)));
    const priceById = new Map<string, { price: number; currency: string }>();
    if (tierIds.length > 0) {
        const { data: tiers } = await admin.from('event_tiers').select('id, price_cents, currency').in('id', tierIds);
        for (const t of (tiers as any[]) ?? []) {
            priceById.set(t.id, { price: Number(t.price_cents ?? 0), currency: t.currency ?? 'usd' });
        }
    }
    let total = 0;
    let currency: string | null = null;
    for (const r of data as any[]) {
        const t = priceById.get(r.tier_id);
        if (t) {
            total += t.price;
            currency = currency ?? t.currency;
        }
    }
    return { paidCount: data.length, totalCents: total, currency };
}

export type CancelAllResult =
    | {
          ok: true;
          refunded: number;
          alreadyDone: number;
          failed: { profile_id: string; order_id: string | null; error: string }[];
      }
    | { ok: false; error: string };

/**
 * Host cancel: cancel the event FIRST (so reserve_spot / event checkout both
 * refuse new holds and purchases — migration 20260814_052), THEN refund every
 * confirmed paid spot. Ethan 2026-09-24: "if the host cancels the event,
 * everyone is refunded in full" — no window check, always full refund.
 *
 * Failure-isolated per order and idempotent: a re-run only has work left for
 * rows that failed last time (already-refunded / already-cancelled orders
 * come back as success with nothing further to do).
 */
export async function cancelEventAndRefundAll(eventId: string): Promise<CancelAllResult> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'Invalid event.' };
    const ev = await loadEventCore(eventId);
    if (!ev) return { ok: false, error: 'Event not found.' };

    const perm = await callerCanManageEvent(ev);
    if (!perm.ok) return { ok: false, error: perm.error };

    const admin = getSupabaseAdmin();

    // 1. Close the door BEFORE any money moves.
    if (!ev.cancelled_at) {
        const { error: cancelErr } = await admin
            .from('events')
            .update({ cancelled_at: new Date().toISOString() })
            .eq('id', eventId);
        if (cancelErr) {
            console.error('[event-refund] setting cancelled_at failed:', cancelErr.message);
            return { ok: false, error: `Could not cancel the event: ${cancelErr.message}` };
        }
    }

    // 2. Refund every confirmed paid spot. Held (unpaid) rows have nothing
    //    captured to refund — they simply can no longer complete payment now
    //    that the event is cancelled (reserve_spot refuses it), and expire
    //    on their own TTL; no action needed for them here.
    const { data: rows, error: rowsErr } = await admin
        .from('event_rsvps')
        .select('profile_id, payment_ref')
        .eq('event_id', eventId)
        .eq('status', 'going')
        .eq('hold_state', 'confirmed')
        .not('payment_ref', 'is', null);
    if (rowsErr) {
        console.error('[event-refund] loading ticket holders failed:', rowsErr.message);
        return { ok: false, error: `Event was cancelled, but could not load ticket holders: ${rowsErr.message}` };
    }

    let refunded = 0;
    let alreadyDone = 0;
    const failed: { profile_id: string; order_id: string | null; error: string }[] = [];

    for (const row of (rows as any[]) ?? []) {
        const orderId = row.payment_ref as string | null;
        const profileId = row.profile_id as string;
        if (!orderId) {
            failed.push({ profile_id: profileId, order_id: null, error: 'No payment reference on this ticket.' });
            continue;
        }
        try {
            const result = await refundAndCancelEventOrder(orderId, { eventId, eventProfileId: profileId });
            if (result.ok) {
                if (result.skipped === 'already_refunded' || result.skipped === 'already_canceled') alreadyDone++;
                else refunded++;
            } else {
                failed.push({ profile_id: profileId, order_id: orderId, error: result.error ?? 'Refund failed.' });
            }
        } catch (e: any) {
            console.error(`[event-refund] ${eventId} ${orderId}: refund threw:`, e?.message ?? e);
            failed.push({ profile_id: profileId, order_id: orderId, error: e?.message ?? 'Refund threw an error.' });
        }
    }

    return { ok: true, refunded, alreadyDone, failed };
}

/**
 * Is this event "paid" for UI-gating purposes (which cancel button to show)?
 * True when any active tier carries a price, or any confirmed row already
 * carries a payment reference. A cheap, good-enough signal for the UI —
 * cancelEventAndRefundAll re-derives the real refund list from the DB itself
 * regardless of what the caller believed when they clicked.
 */
export async function eventHasPaidExposure(eventId: string): Promise<boolean> {
    if (!UUID_RE.test(eventId)) return false;
    const admin = getSupabaseAdmin();
    const [{ data: tiers }, { data: paidRows }] = await Promise.all([
        admin.from('event_tiers').select('price_cents').eq('event_id', eventId).eq('active', true).gt('price_cents', 0).limit(1),
        admin
            .from('event_rsvps')
            .select('profile_id')
            .eq('event_id', eventId)
            .eq('status', 'going')
            .eq('hold_state', 'confirmed')
            .not('payment_ref', 'is', null)
            .limit(1),
    ]);
    return ((tiers as any[])?.length ?? 0) > 0 || ((paidRows as any[])?.length ?? 0) > 0;
}

/**
 * Belt-and-suspenders check for the shop-console order guard: is this order
 * an event-package order, and (if so) is the refund window still open? Shop
 * console order actions call this before falling through to the vendor-scoped
 * refund/cancel — see the comment on that call site for why an event order
 * can never actually reach this console today.
 */
export async function eventOrderRefundGuard(
    orderId: string,
): Promise<{ isEventOrder: false } | { isEventOrder: true; windowOpen: boolean; eventId: string | null }> {
    const meta = await getOrderEventMeta(orderId);
    if (!meta?.eventId) return { isEventOrder: false };
    const windowOpen = await getRefundWindowOpen(meta.eventId);
    return { isEventOrder: true, windowOpen, eventId: meta.eventId };
}
