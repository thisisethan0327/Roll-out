import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Sidebar attention count = open action items + pending verification requests.
 * Server-rendered on every console navigation, so it stays fresh without any
 * client polling. Best-effort — a count failure never blocks the shell.
 */
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
