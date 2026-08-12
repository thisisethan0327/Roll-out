/**
 * Console shell — enforces requirePlatformAdmin once per navigation, then
 * renders the sidebar + content for every page underneath.
 */
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AdminSidebar } from '../AdminSidebar';
import { JumpBar } from '../JumpBar';

/**
 * Sidebar attention count = open action items + pending verification requests.
 * Server-rendered on every console navigation, so it stays fresh without any
 * client polling. Best-effort — a count failure never blocks the shell.
 */
async function getAttentionCount(): Promise<number> {
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

export default async function ConsoleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { profile } = await requirePlatformAdmin();
    const attentionCount = await getAttentionCount();
    return (
        <div className="admin-layout">
            <AdminSidebar adminLabel={`@${profile.handle}`} attentionCount={attentionCount} />
            <div className="admin-main">
                <div className="admin-header">
                    <JumpBar />
                </div>
                {children}
            </div>
        </div>
    );
}
