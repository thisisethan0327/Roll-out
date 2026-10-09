/**
 * /admin/users/[id]/messages — platform-admin read of a member's private DM
 * threads, for disputes (Part 2). The page itself loads NOTHING private: the
 * thread list is fetched by a server action after the admin types a reason, via
 * the admin_list_threads RPC on the admin's OWN session, which writes the
 * admin_audit row before returning. Authorization: requirePlatformAdmin() here,
 * in the console layout, in the actions, and in the RPC.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { UUID_RE } from '@/lib/admin-user-facts';
import { ThreadsGate } from './ReasonGate';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

export default async function AdminUserMessagesPage({ params }: { params: Promise<{ id: string }> }) {
    await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const { data } = await getSupabaseAdmin().from('profiles').select('id, handle, kind').eq('id', id).maybeSingle();
    const p = data as { id: string; handle: string; kind: string } | null;
    if (!p) notFound();

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">@{p.handle} · MESSAGES</div>
                    <div className="admin-page-sub">PRIVATE DMS · REASON REQUIRED · EVERY VIEW IS LOGGED</div>
                </div>
                <Link href={`/admin/users/${p.id}`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                    ‹ BACK TO USER
                </Link>
            </div>
            <ThreadsGate profileId={p.id} handle={p.handle} />
        </>
    );
}
