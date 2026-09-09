/**
 * Existence gate for /post/[id], so a missing or private post is a real 404.
 *
 * Same fault and same fix as /event/[id] (729e195): the segment's loading.tsx
 * flushes the shell and commits 200 before the page's notFound() can run.
 * Measured on production at run R12: /post/<unknown uuid> → 200. A layout
 * resolves before that first flush; loading.tsx stays.
 *
 * The condition mirrors the page's loadPost(): a uuid, a row, not deleted,
 * public. A private or deleted post must 404 for a stranger exactly as the
 * page does, or the status of the 404 itself would confirm the post exists.
 */
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Force dynamic rendering. Without a dynamic API in the tree (this page reads
 * no cookies, headers or searchParams), the BUILT app may serve the segment's
 * static shell — the loading skeleton — with a 200 before this layout runs,
 * and notFound() can no longer change the status. Measured at run R12: the
 * dev server answered 404 (it never prerenders), production answered 200 with
 * the not-found title. /store/p already declares this; /event reads
 * searchParams, which forces it implicitly.
 */
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PostLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('posts')
        .select('id, deleted_at, visibility')
        .eq('id', id)
        .maybeSingle();

    // Fail OPEN on a lookup error — an outage must not 404 every post.
    if (error) {
        console.error('[post/[id]] existence check failed:', error.message);
        return <>{children}</>;
    }
    const post = data as { deleted_at?: string | null; visibility?: string | null } | null;
    if (!post || post.deleted_at || post.visibility !== 'public') notFound();

    return <>{children}</>;
}
