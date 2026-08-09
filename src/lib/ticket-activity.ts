/**
 * Append a row to `public.ticket_activity` (the shared per-ticket audit feed
 * emwraps-tickets renders in its bell/timeline).
 *
 * Columns: type, title, description, metadata (jsonb), created_by (→
 * public.profiles.id, nullable), target_worker_id (→ public.profiles.id,
 * nullable), internal (bool). We scope by ticket join — there is no shop_id on
 * this table; callers must have already verified the ticket belongs to the
 * shop before logging.
 *
 * Best-effort: a logging failure is swallowed (console.error) so it never
 * breaks the primary mutation.
 *
 * `type` value vocabulary (matches emwraps activityMeta.js so the legacy app
 * renders our rows correctly): created | status_change | checkin | checkout |
 * progress | note | photo_added | service_added | message | worker_assigned.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type TicketActivityInput = {
    ticketId: string;
    type: string;
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown>;
    internal?: boolean;
    createdBy?: string | null;
    targetWorkerId?: string | null;
};

export async function logTicketActivity(
    pub: SupabaseClient<any, any, any>,
    input: TicketActivityInput,
): Promise<void> {
    try {
        const { error } = await pub.from('ticket_activity').insert({
            ticket_id: input.ticketId,
            type: input.type,
            title: input.title,
            description: input.description ?? null,
            metadata: input.metadata ?? {},
            internal: input.internal ?? false,
            created_by: input.createdBy ?? null,
            target_worker_id: input.targetWorkerId ?? null,
        });
        if (error) console.error('[ticket-activity] insert failed:', error.message);
    } catch (e: any) {
        console.error('[ticket-activity] threw:', e?.message ?? e);
    }
}
