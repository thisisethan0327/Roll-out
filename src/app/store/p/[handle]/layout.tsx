/**
 * Existence gate for /store/p/[handle], so a missing product is a real 404.
 *
 * Same fault and same fix as /event/[id] (729e195): the segment's loading.tsx
 * flushes the shell and commits 200 before the page's notFound() can run.
 * Measured on production at run R12: /store/p/<unknown> → 200. A layout
 * resolves before that first flush; loading.tsx stays.
 *
 * Uses the page's own loader so the two can never disagree about what exists.
 * The extra call is one Store API read per product page; Next dedupes
 * identical fetches within a render where the loader lets it.
 */
import { notFound } from 'next/navigation';
import { fetchProductByHandle } from '@/lib/medusa';

export default async function ProductLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ handle: string }>;
}) {
    const { handle } = await params;
    if (!handle || handle.length > 200) notFound();

    let product: unknown = null;
    try {
        product = await fetchProductByHandle(handle);
    } catch (e) {
        // Fail OPEN: a Medusa outage must not 404 the whole store.
        console.error('[store/p] existence check failed:', e instanceof Error ? e.message : e);
        return <>{children}</>;
    }
    if (!product) notFound();

    return <>{children}</>;
}
