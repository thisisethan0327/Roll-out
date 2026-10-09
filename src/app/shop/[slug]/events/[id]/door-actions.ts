'use server';
/**
 * Door list check-in for the shop console event page.
 *
 * The write is host_check_in_ticket called AS THE MEMBER (their own session):
 * the RPC itself requires the event's host, a manager of the host shop, or (since
 * migration 092) a platform admin. The shop membership guard + ticket->event->shop
 * binding below is defense-in-depth, keeping the acting shop honest about which
 * event the ticket belongs to. When a platform admin's access is what lets the
 * RPC through, the RPC writes its own admin_audit row (door.check_in), so nothing
 * is logged from here; before 092 it refuses them with its usual text, shown as is.
 */
import { revalidatePath } from 'next/cache';
import { requireShopMember } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hostCheckInTicket } from '@/lib/event-tickets';

type Result = { ok: true; already: boolean; claimed: boolean } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function shopDoorCheckInAction(
    shopId: number,
    slug: string,
    eventId: string,
    ticketId: string,
): Promise<Result> {
    await requireShopMember(shopId);
    if (!UUID_RE.test(eventId) || !UUID_RE.test(ticketId)) return { ok: false, error: 'Bad request.' };

    const admin = getSupabaseAdmin();
    const [{ data: ev }, { data: tk }] = await Promise.all([
        admin.from('events').select('id, shop_id').eq('id', eventId).maybeSingle(),
        admin.from('event_tickets').select('id, event_id').eq('id', ticketId).maybeSingle(),
    ]);
    if (!ev || (ev as any).shop_id !== shopId) {
        return { ok: false, error: 'That event is not hosted by this shop.' };
    }
    if (!tk || (tk as any).event_id !== eventId) {
        return { ok: false, error: 'That ticket is not for this event.' };
    }

    const res = await hostCheckInTicket(ticketId);
    if (res.ok) revalidatePath(`/shop/${slug}/events/${eventId}`);
    return res;
}
