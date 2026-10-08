import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Sidebar attention count = open action items + pending verification requests.
 * Server-rendered on every console navigation, so it stays fresh without any
 * client polling. Best-effort — a count failure never blocks the shell.
 */
/** Open (status = pending) content reports, for the REPORTS sidebar badge. Best-effort. */
export async function getPendingReportsCount(): Promise<number> {
    try {
        const { count } = await getSupabaseAdmin()
            .from('content_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        return count ?? 0;
    } catch {
        return 0;
    }
}

export async function getAttentionCount(): Promise<number> {
    try {
        const admin = getSupabaseAdmin();
        const [items, verifs] = await Promise.all([
            admin
                .from('action_items')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'open'),
            admin
                .from('verification_requests')
                .select('*', { count: 'exact', head: true })
                .eq('state', 'pending'),
        ]);
        return (items.count ?? 0) + (verifs.count ?? 0);
    } catch {
        return 0;
    }
}
