/**
 * Existence gate for /u/[handle], so a missing profile is a real 404.
 *
 * Same fault and same fix as /event/[id] (729e195): this segment has a
 * loading.tsx, whose Suspense boundary flushes the shell and commits HTTP 200
 * before the page's await resolves, so the page's notFound() rendered the
 * not-found UI with a 200. Measured on production at run R12: /u/<unknown>
 * → 200. A layout resolves BEFORE that first flush. loading.tsx stays.
 *
 * The condition mirrors the page's loadHandle() exactly: case-insensitive
 * handle match, and a shop_page profile whose shop is not verified is publicly
 * invisible — it must 404 for a stranger the same way it does on the page,
 * or the status of the 404 itself would say whether a shop exists.
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

function stripAt(h: string): string {
    return h.startsWith('@') ? h.slice(1) : h;
}

export default async function ProfileLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ handle: string }>;
}) {
    const { handle: raw } = await params;
    let handle = '';
    try {
        handle = stripAt(decodeURIComponent(raw)).trim();
    } catch {
        notFound();
    }
    if (!handle) notFound();

    const admin = getSupabaseAdmin();
    const { data: profile, error } = await admin
        .from('profiles')
        .select('id, kind, shop_id')
        .ilike('handle', handle)
        .maybeSingle();

    // Fail OPEN on a lookup error — an outage must not 404 every profile.
    if (error) {
        console.error('[u/[handle]] existence check failed:', error.message);
        return <>{children}</>;
    }
    if (!profile) notFound();

    const p = profile as { kind?: string; shop_id?: number | null };
    if (p.kind === 'shop_page') {
        const { data: shop, error: shopError } = await admin
            .from('shops')
            .select('status')
            .eq('id', p.shop_id)
            .maybeSingle();
        if (shopError) {
            console.error('[u/[handle]] shop status check failed:', shopError.message);
            return <>{children}</>;
        }
        if ((shop as { status?: string } | null)?.status !== 'verified') notFound();
    }

    return <>{children}</>;
}
