/**
 * /admin/users/[id]/messages/[threadId] — one DM thread, behind the reason
 * gate. Like the list page it renders no private data itself; see ../page.tsx.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { UUID_RE } from '@/lib/admin-user-facts';
import { ThreadGate } from '../ReasonGate';
import { AdminHead } from '@/components/glide-admin/parts';

export const metadata = { title: 'Thread' };
export const dynamic = 'force-dynamic';

export default async function AdminUserThreadPage({ params }: { params: Promise<{ id: string; threadId: string }> }) {
    await requirePlatformAdmin();
    const { id, threadId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(threadId)) notFound();

    return (
        <>
            <AdminHead
                back={{ href: `/admin/users/${id}/messages`, label: 'All threads' }}
                title="Thread"
                sub="Private DM. A reason is required and every view is logged."
            />
            <ThreadGate profileId={id} threadId={threadId} />
        </>
    );
}
