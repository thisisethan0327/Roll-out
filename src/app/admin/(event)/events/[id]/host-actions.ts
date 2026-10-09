'use server';
/**
 * Admin-scoped writes for MEMBER-HOSTED events (shop_id null), used by the
 * HostEventEditForm on /admin/events/[id].
 *
 * The /me host actions bind `.eq('host_id', <caller>)`, so a platform admin
 * cannot reuse them. These mirror them with the ownership filter replaced by a
 * server-side requirePlatformAdmin() (never a param/cookie/prop). Every action
 * refuses shop events (shop_id != null): those are edited in the shop console
 * (/shop/<slug>/events/<id>) where the shop's own rules apply.
 *
 * Return types match the /me actions exactly so the form can take either set.
 */
import { revalidatePath } from 'next/cache';
import { logAdminAction, requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getRolloutMemberClient } from '@/lib/consumer';
import { eventHasPaidExposure } from '@/lib/event-refund';
import { hostCheckInTicket, parseRefundQuoteLike } from '@/lib/event-tickets';
import { refundAndCancelEventOrder } from '@/lib/medusa-admin';
import { refundSeatShareAsPlatform } from '@/lib/admin-ticket-refund';
import { writeWithAreaLabel } from '@/lib/event-area-label';
import { parseHostEventUpdate } from '@/lib/host-event-write';
import type {
    HostEventActionResult,
    RoutePlanStopInput,
    SetRoutePlanResult,
} from '@/app/me/events/actions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOP_EVENT_MSG = 'Shop events are edited in the shop console.';

/** Loads the event's ownership columns; `error` is a user-facing refusal. */
async function loadMemberHostedEvent(
    eventId: string,
): Promise<{ ok: true; hostId: string | null } | { ok: false; error: string }> {
    if (!UUID_RE.test(eventId)) return { ok: false, error: 'Event not found.' };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('events')
        .select('id, shop_id, host_id')
        .eq('id', eventId)
        .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const ev = data as { shop_id: number | null; host_id: string | null } | null;
    if (!ev) return { ok: false, error: 'Event not found.' };
    if (ev.shop_id != null) return { ok: false, error: SHOP_EVENT_MSG };
    return { ok: true, hostId: ev.host_id };
}

function revalidateEvent(eventId: string) {
    revalidatePath('/admin/events');
    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath(`/me/events/${eventId}`);
    revalidatePath(`/event/${eventId}`);
    revalidatePath('/meets');
}

export async function adminUpdateHostEvent(
    eventId: string,
    formData: FormData,
): Promise<HostEventActionResult> {
    const { profile } = await requirePlatformAdmin();
    const ev = await loadMemberHostedEvent(eventId);
    if (!ev.ok) return ev;

    const parsed = parseHostEventUpdate(formData);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const { row: updateRow, area_label } = parsed;

    const admin = getSupabaseAdmin();
    const { error } = await writeWithAreaLabel((withArea) =>
        admin
            .from('events')
            .update(withArea ? { ...updateRow, area_label } : updateRow)
            .eq('id', eventId)
            .is('shop_id', null),
    );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(profile, 'event.update_as_host', 'event', eventId, { host_id: ev.hostId });
    revalidateEvent(eventId);
    return { ok: true };
}

export async function adminCancelHostEvent(eventId: string, cancel: boolean): Promise<void> {
    const { profile } = await requirePlatformAdmin();
    const ev = await loadMemberHostedEvent(eventId);
    if (!ev.ok) throw new Error(ev.error);

    // 077: same hard guard as cancelHostEvent / forceCancelEvent — a paid event
    // is never cancelled without refunding its ticket holders.
    if (cancel && (await eventHasPaidExposure(eventId))) {
        throw new Error(
            'This event has paid tickets — use "Cancel event & refund everyone" so ticket holders are refunded.',
        );
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: cancel ? new Date().toISOString() : null })
        .eq('id', eventId)
        .is('shop_id', null);
    if (error) throw new Error(error.message);

    await logAdminAction(profile, 'event.cancel_as_host', 'event', eventId, {
        host_id: ev.hostId,
        cancelled: cancel,
    });
    revalidateEvent(eventId);
}

export async function adminSetEventRoutePlan(
    eventId: string,
    stops: RoutePlanStopInput[],
): Promise<SetRoutePlanResult> {
    const { profile } = await requirePlatformAdmin();
    const ev = await loadMemberHostedEvent(eventId);
    if (!ev.ok) return ev;

    // Same renumbering as setEventRoutePlan: strictly ascending seq 100, 200, …
    const plan = stops.map((s, i) => {
        const entry: Record<string, unknown> = {
            seq: (i + 1) * 100,
            kind: s.kind,
            name: s.name.trim(),
            lat: s.lat,
            lng: s.lng,
        };
        if (s.etaLocal && s.etaLocal.trim()) entry.eta_local = s.etaLocal.trim();
        if (s.dwellMin != null && Number.isFinite(s.dwellMin)) entry.dwell_min = s.dwellMin;
        if (s.note && s.note.trim()) entry.note = s.note.trim();
        return entry;
    });

    // Runs on the ADMIN'S OWN session: set_event_route_plan is security definer
    // and admits rollout.is_platform_admin() against auth.uid(), so the real
    // caller must be visible to it (not the service-role client).
    const member = await getRolloutMemberClient();
    const { data, error } = await member.rpc('set_event_route_plan', {
        p_event: eventId,
        p_plan: plan.length > 0 ? plan : null,
    });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(profile, 'event.route_plan_as_host', 'event', eventId, {
        host_id: ev.hostId,
        stops: plan.length,
    });
    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath(`/me/events/${eventId}`);
    revalidatePath(`/event/${eventId}`);
    return { ok: true, count: (data as number | null) ?? 0 };
}

// ── Door check-in as platform admin (any event: shop-hosted OR member-hosted) ──

type DoorResult = { ok: true; already: boolean; claimed: boolean } | { ok: false; error: string };

/**
 * Check a ticket in at the door from /admin/events/[id]. Unlike the other
 * actions here there is NO shop_id restriction: an admin runs the door for a
 * shop's event and a member's alike.
 *
 * The write is host_check_in_ticket called AS THE ADMIN (their own session):
 * since migration 092 the RPC admits rollout.is_platform_admin() and writes the
 * admin_audit row itself (door.check_in); before 092 it refuses with its normal "only the host or a
 * shop manager" text, which is shown to the admin as is. Authorization is
 * requirePlatformAdmin() (server-side); the ids are re-bound to each other with
 * the service role so a ticket of another event can't be smuggled in.
 */
export async function adminDoorCheckInAction(eventId: string, ticketId: string): Promise<DoorResult> {
    await requirePlatformAdmin();
    if (!UUID_RE.test(eventId) || !UUID_RE.test(ticketId)) return { ok: false, error: 'Bad request.' };

    const admin = getSupabaseAdmin();
    const [{ data: ev }, { data: tk }] = await Promise.all([
        admin.from('events').select('id').eq('id', eventId).maybeSingle(),
        admin.from('event_tickets').select('id, event_id').eq('id', ticketId).maybeSingle(),
    ]);
    if (!ev) return { ok: false, error: 'Event not found.' };
    if (!tk || (tk as any).event_id !== eventId) {
        return { ok: false, error: 'That ticket is not for this event.' };
    }

    // The RPC logs the admin override itself (door.check_in on the event_ticket),
    // so this action writes no audit row of its own.
    const res = await hostCheckInTicket(ticketId);
    if (res.ok) revalidateEvent(eventId);
    return res;
}

// ── Per-ticket refund and remove-RSVP as platform admin (Part 2) ─────────────
//
// Money moves only here and in lib/ban-refunds.ts. Both actions re-run
// requirePlatformAdmin() and take ids only: the ticket/RSVP is re-read from the
// DB and re-bound to the event, so a forged id cannot refund another event's
// order. Admins are NOT bound by the member refund window: a seat 1 ticket (or a
// seat >= 2 outside the window) is refunded as the WHOLE ORDER, which has no
// window check; the confirm dialog says so and shows the amount.

export type AdminRefundQuote =
    | {
          ok: true;
          /** 'share' = this seat only; 'whole_order' = every ticket on the order is cancelled and refunded. */
          mode: 'share' | 'whole_order';
          amountCents: number;
          /** Confirmed tickets on the order (display). */
          tickets: number;
          /** Seat >= 2 outside the refund window: only the whole order can be refunded now. */
          windowClosed?: boolean;
      }
    | { ok: false; error: string };

type TicketLoad =
    | {
          ok: true;
          t: { id: string; seat: number; status: string; order_id: string; order_paid_cents: number | null };
          left: number;
          confirmed: number;
      }
    | { ok: false; error: string };

/** Re-read a ticket, bind it to the event, and compute what is still refundable on its order. */
async function loadRefundableTicket(eventId: string, ticketId: string): Promise<TicketLoad> {
    if (!UUID_RE.test(eventId) || !UUID_RE.test(ticketId)) return { ok: false, error: 'Bad request.' };
    const admin = getSupabaseAdmin();
    const { data: tk, error } = await admin
        .from('event_tickets')
        .select('id, event_id, seat, status, order_id, order_paid_cents')
        .eq('id', ticketId)
        .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const t = tk as any;
    if (!t || t.event_id !== eventId) return { ok: false, error: 'That ticket is not for this event.' };
    if (t.status !== 'confirmed') return { ok: false, error: 'Only a confirmed ticket can be refunded.' };
    if (!t.order_id) return { ok: false, error: 'This ticket has no paid order.' };

    const { data: sibs, error: sibErr } = await admin
        .from('event_tickets')
        .select('status, refund_cents')
        .eq('order_id', t.order_id)
        .eq('event_id', eventId)
        .in('status', ['confirmed', 'cancelled']);
    if (sibErr) return { ok: false, error: sibErr.message };
    const rows = (sibs as any[]) ?? [];
    const refunded = rows.filter((r) => r.status === 'cancelled').reduce((a, r) => a + Number(r.refund_cents ?? 0), 0);
    const left = Math.max(Number(t.order_paid_cents ?? 0) - refunded, 0);
    return {
        ok: true,
        t: { id: t.id, seat: Number(t.seat ?? 0), status: t.status, order_id: t.order_id, order_paid_cents: t.order_paid_cents },
        left,
        confirmed: rows.filter((r) => r.status === 'confirmed').length,
    };
}

/** What a REFUND on this ticket would do and cost; read-only, shown in the confirm dialog. */
export async function adminRefundTicketQuoteAction(eventId: string, ticketId: string): Promise<AdminRefundQuote> {
    await requirePlatformAdmin();
    const loaded = await loadRefundableTicket(eventId, ticketId);
    if (!loaded.ok) return loaded;
    const { t, left, confirmed } = loaded;
    if (t.seat <= 1) return { ok: true, mode: 'whole_order', amountCents: left, tickets: confirmed };

    // Seat >= 2: the DB share math (and refund-window check) is ticket_refund_quote's.
    const { data, error } = await getSupabaseAdmin().rpc('ticket_refund_quote', { p_ticket: ticketId });
    if (error) return { ok: false, error: error.message };
    const q = parseRefundQuoteLike(data, ticketId);
    if (q.ok) return { ok: true, mode: 'share', amountCents: q.quote.amountCents, tickets: confirmed };
    if (q.state === 'window_closed') {
        return { ok: true, mode: 'whole_order', amountCents: left, tickets: confirmed, windowClosed: true };
    }
    return { ok: false, error: q.error };
}

type RefundResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Refund one ticket. mode 'share' = this seat only (seat >= 2, inside the
 * window); 'whole_order' = refund and cancel the entire order (seat 1, or any
 * seat once the window is closed). Logs ticket.refund_as_admin either way.
 */
export async function adminRefundTicketAction(
    eventId: string,
    ticketId: string,
    mode: 'share' | 'whole_order',
): Promise<RefundResult> {
    const { profile } = await requirePlatformAdmin();
    const loaded = await loadRefundableTicket(eventId, ticketId);
    if (!loaded.ok) return loaded;
    const { t, left } = loaded;
    if (mode !== 'share' && mode !== 'whole_order') return { ok: false, error: 'Bad request.' };

    let result: string;
    let amountCents = left;
    if (mode === 'whole_order') {
        const res = await refundAndCancelEventOrder(t.order_id, { eventId });
        if (!res.ok) {
            await logAdminAction(profile, 'ticket.refund_as_admin', 'event_ticket', ticketId, {
                event_id: eventId,
                order_id: t.order_id,
                mode,
                amount_cents: left,
                result: 'failed',
                error: String(res.error ?? '').slice(0, 300),
            });
            return { ok: false, error: res.error ?? 'Refund failed.' };
        }
        result = res.skipped ? `refunded (${res.skipped})` : 'refunded';
    } else {
        if (t.seat <= 1) return { ok: false, error: "The buyer's own ticket refunds the whole order." };
        const res = await refundSeatShareAsPlatform(ticketId, eventId);
        if (!res.ok) {
            await logAdminAction(profile, 'ticket.refund_as_admin', 'event_ticket', ticketId, {
                event_id: eventId,
                order_id: t.order_id,
                mode,
                result: res.kind,
                error: res.error.slice(0, 300),
            });
            return {
                ok: false,
                error:
                    res.kind === 'window_closed'
                        ? 'Outside the refund window: refund the whole order instead.'
                        : res.error,
            };
        }
        amountCents = res.amountCents;
        result = 'refunded';
    }

    await logAdminAction(profile, 'ticket.refund_as_admin', 'event_ticket', ticketId, {
        event_id: eventId,
        order_id: t.order_id,
        mode,
        amount_cents: amountCents,
        result,
    });
    revalidateEvent(eventId);
    return { ok: true, message: mode === 'whole_order' ? 'Order refunded and cancelled.' : 'Ticket refunded.' };
}

type RsvpLoad =
    | { ok: true; rsvp: { profile_id: string; status: string; payment_ref: string | null } }
    | { ok: false; error: string };

async function loadRsvp(eventId: string, profileId: string): Promise<RsvpLoad> {
    if (!UUID_RE.test(eventId) || !UUID_RE.test(profileId)) return { ok: false, error: 'Bad request.' };
    const { data, error } = await getSupabaseAdmin()
        .from('event_rsvps')
        .select('profile_id, status, payment_ref')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'That RSVP no longer exists.' };
    return { ok: true, rsvp: data as any };
}

/** Refund the whole paid order behind an RSVP row (events without per-ticket rows). */
export async function adminRefundRsvpAction(eventId: string, profileId: string): Promise<RefundResult> {
    const { profile } = await requirePlatformAdmin();
    const loaded = await loadRsvp(eventId, profileId);
    if (!loaded.ok) return loaded;
    const orderId = loaded.rsvp.payment_ref;
    if (!orderId) return { ok: false, error: 'This spot is not paid: use REMOVE.' };

    const res = await refundAndCancelEventOrder(orderId, { eventId, eventProfileId: profileId });
    await logAdminAction(profile, 'ticket.refund_as_admin', 'event', eventId, {
        event_id: eventId,
        order_id: orderId,
        rsvp_profile_id: profileId,
        mode: 'whole_order',
        result: res.ok ? (res.skipped ? `refunded (${res.skipped})` : 'refunded') : 'failed',
        ...(res.ok ? {} : { error: String(res.error ?? '').slice(0, 300) }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? 'Refund failed.' };
    revalidateEvent(eventId);
    return { ok: true, message: 'Order refunded and cancelled.' };
}

/**
 * Remove a FREE RSVP (admin_cancel_rsvp: service role). A paid spot is refused:
 * admin_cancel_rsvp would cancel the order's tickets WITHOUT a refund, so a paid
 * spot must go through REFUND first.
 */
export async function adminRemoveRsvpAction(eventId: string, profileId: string): Promise<RefundResult> {
    const { profile } = await requirePlatformAdmin();
    const loaded = await loadRsvp(eventId, profileId);
    if (!loaded.ok) return loaded;
    if (loaded.rsvp.payment_ref) return { ok: false, error: 'This spot is paid: use REFUND.' };

    const { error } = await getSupabaseAdmin().rpc('admin_cancel_rsvp', { p_event: eventId, p_profile: profileId });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(profile, 'rsvp.remove_as_admin', 'event', eventId, {
        event_id: eventId,
        profile_id: profileId,
        previous_status: loaded.rsvp.status,
    });
    revalidateEvent(eventId);
    return { ok: true, message: 'RSVP removed.' };
}
