'use server';
/**
 * Door list check-in for an individual host's own event (/me/events/[id]).
 *
 * The write is host_check_in_ticket called AS THE MEMBER (their own session);
 * the RPC enforces host = caller itself. The verified-host guard and the
 * ownership/ticket binding below are defense-in-depth (same ownership rule as
 * the rest of /me/events: host_id = caller AND shop_id null).
 */
import { revalidatePath } from 'next/cache';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hostCheckInTicket } from '@/lib/event-tickets';

type Result = { ok: true; already: boolean; claimed: boolean } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function hostDoorCheckInAction(eventId: string, ticketId: string): Promise<Result> {
    const profile = await requireVerifiedHost('/me/events');
    if (!UUID_RE.test(eventId) || !UUID_RE.test(ticketId)) return { ok: false, error: 'Bad request.' };

    const admin = getSupabaseAdmin();
    const [{ data: ev }, { data: tk }] = await Promise.all([
        admin.from('events').select('id, host_id, shop_id').eq('id', eventId).maybeSingle(),
        admin.from('event_tickets').select('id, event_id').eq('id', ticketId).maybeSingle(),
    ]);
    if (!ev || (ev as any).host_id !== profile.profileId || (ev as any).shop_id != null) {
        return { ok: false, error: 'You can only check people in to your own events.' };
    }
    if (!tk || (tk as any).event_id !== eventId) {
        return { ok: false, error: 'That ticket is not for this event.' };
    }

    const res = await hostCheckInTicket(ticketId);
    if (res.ok) revalidatePath(`/me/events/${eventId}`);
    return res;
}
