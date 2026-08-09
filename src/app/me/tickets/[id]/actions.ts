'use server';
/**
 * Customer-side ticket chat. The insert goes through the ANON SSR client so
 * RLS (rollout_me_ticket_messages_insert) is the enforcement: the WITH CHECK
 * requires sender_type='customer', visibility='customer', and the ticket to be
 * one the caller owns. A member therefore cannot post into a stranger's ticket
 * even by supplying its id — the database refuses the row.
 */
import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getConsumerProfile } from '@/lib/consumer';

export async function sendCustomerMessage(
    ticketId: string,
    message: string,
): Promise<{ ok: boolean; error?: string }> {
    const body = message.trim();
    if (!body) return { ok: false, error: 'Empty message.' };
    if (body.length > 4000) return { ok: false, error: 'Message too long.' };

    const profile = await getConsumerProfile();
    if (!profile) return { ok: false, error: 'Not signed in.' };

    const supabase = await getSupabaseServer(); // anon — RLS enforces ownership
    const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        sender_type: 'customer',
        sender_name: profile.displayName || profile.handle || 'Customer',
        message: body,
        visibility: 'customer',
    });
    if (error) {
        return { ok: false, error: error.message };
    }
    revalidatePath(`/me/tickets/${ticketId}`);
    return { ok: true };
}
