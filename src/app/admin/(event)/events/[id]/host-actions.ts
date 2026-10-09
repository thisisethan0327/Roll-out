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
import { hostCheckInTicket } from '@/lib/event-tickets';
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
