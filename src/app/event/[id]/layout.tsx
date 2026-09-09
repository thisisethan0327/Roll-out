/**
 * Existence gate for /event/[id], so a missing event is a real 404.
 *
 * The page already calls notFound(), but this segment has a loading.tsx: that
 * Suspense boundary makes Next flush the shell immediately, so the 200 is
 * already committed by the time the page's await resolves and notFound() runs.
 * The result was a soft 404 — the not-found UI served with HTTP 200, measured
 * on production at run R12 for an unknown uuid, a non-uuid, AND a followers-only
 * event. Crawlers index every private or deleted meet that way.
 *
 * A layout resolves BEFORE that first flush, so the check has to live here to
 * affect the status. loading.tsx stays and keeps covering the page's heavier
 * work; this query is deliberately two columns.
 *
 * The condition mirrors the page's exactly — a private event must 404 for a
 * stranger, not merely fail to render, or the 404 itself tells them it exists.
 */
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventLayout({
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
        .from('events')
        .select('id, visibility')
        .eq('id', id)
        .maybeSingle();

    // Fail OPEN on a lookup error: an outage should not turn every live event
    // into a 404. A genuinely missing row is `data === null` with no error.
    if (error) {
        console.error('[event/[id]] existence check failed:', error.message);
        return <>{children}</>;
    }
    if (!data || (data as { visibility?: string }).visibility !== 'public') notFound();

    return <>{children}</>;
}
