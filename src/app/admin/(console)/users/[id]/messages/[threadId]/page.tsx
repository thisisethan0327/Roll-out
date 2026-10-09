/**
 * /admin/users/[id]/messages/[threadId] — one DM thread, behind the reason
 * gate. Like the list page it renders no private data itself; see ../page.tsx.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { UUID_RE } from '@/lib/admin-user-facts';
import { ThreadGate } from '../ReasonGate';

export const metadata = { title: 'Thread' };
export const dynamic = 'force-dynamic';

export default async function AdminUserThreadPage({ params }: { params: Promise<{ id: string; threadId: string }> }) {
    await requirePlatformAdmin();
    const { id, threadId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(threadId)) notFound();

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">THREAD</div>
                    <div className="admin-page-sub">PRIVATE DM · REASON REQUIRED · EVERY VIEW IS LOGGED</div>
                </div>
                <Link
                    href={`/admin/users/${id}/messages`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ ALL THREADS
                </Link>
            </div>
            <ThreadGate profileId={id} threadId={threadId} />
        </>
    );
}
