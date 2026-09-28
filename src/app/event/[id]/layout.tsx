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
 *
 * "Visible but locked" (migrations 088/089): a non-public event a stranger may
 * NOT open still renders (200) when it has a row in rollout.event_teasers —
 * upcoming, not cancelled — and the page then shows only the teaser. Anything
 * else non-public (past, cancelled, unknown) keeps the real 404. Before the
 * view exists fetchEventTeaser() returns null, so this is exactly the old
 * behaviour. Layouts get no searchParams, so ?invite is claimed by the page
 * (resolveEventAccess); a teaser event passes this gate either way.
 */
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { currentViewer, viewerCanViewEvent } from '@/lib/event-viewer';
import { fetchEventTeaser } from '@/lib/event-teasers';

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
        .select('id, visibility, host_id, shop_id')
        .eq('id', id)
        .maybeSingle();

    // Fail OPEN on a lookup error: an outage should not turn every live event
    // into a 404. A genuinely missing row is `data === null` with no error.
    if (error) {
        console.error('[event/[id]] existence check failed:', error.message);
        return <>{children}</>;
    }
    if (!data) notFound();
    const row = data as { id: string; visibility: string | null; host_id: string | null; shop_id: number | null };
    // Non-public: same rule as the page (rollout._can_view_event, falling back
    // to host / shop manager+ / platform admin / RSVP holder). Everyone else
    // gets the locked teaser if there is one, otherwise a real 404.
    if (row.visibility !== 'public' && !(await viewerCanViewEvent(row, await currentViewer()))) {
        if (!(await fetchEventTeaser(id))) notFound();
    }

    return <>{children}</>;
}
