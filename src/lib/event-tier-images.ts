/**
 * Best-effort product thumbnail + gallery images for event-tier Medusa
 * products — shared by the public /event/[id] page (TiersSection cards) and
 * the /api/events/[id]/tier-media route handler the mobile app calls.
 *
 * Read-only, server-only, and PUBLIC: it uses the walled Events channel's
 * publishable key (server-side-only env, no NEXT_PUBLIC prefix, never
 * returned to the client) but no customer bearer token — mirroring the
 * unauthenticated `id[]` product lookup already done in
 * event-cart.ts#createEventPackageCart, which proves the Events store API
 * answers product reads without a signed-in member. A visitor just browsing
 * the event page (not RSVPing), or the app before anyone's signed in, should
 * still see the tier's package photo.
 *
 * Cached via Next's fetch cache for 10 minutes and guarded by a 3s timeout —
 * a slow or unreachable Medusa must never block or break the event page, so
 * every failure path (missing env, timeout, non-200, network error) resolves
 * to {} and callers render tier cards with no image.
 *
 * Display sizing: the catalog's product photos are full-res prints (multi-MB
 * PNGs) — never shipped to a card as-is. The backend already writes a
 * web-sized twin next to every original at `opt/<name>.webp` in the same
 * public bucket (the house convention `optimizedSrc` in ./optimized-image.ts
 * already applies for the general storefront's Medusa images — reused here
 * rather than re-implementing the same opt/ + extension swap). `thumbnail`/
 * `images` are that derived, web-sized URL; `thumbnailOriginal`/
 * `imagesOriginal` are the untouched originals, carried alongside purely so
 * the renderer (web <img onError>, or the app's <Image onError>) can fall
 * back to the original if a twin 404s (e.g. the batch optimiser hasn't run
 * for a brand-new upload yet).
 */
import 'server-only';
import { optimizedSrc } from './optimized-image';

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_URL || 'https://api.neferstock.com';

// Server-side-only Events channel key — same env var event-cart.ts reads.
// NO in-code fallback: unset → this feature quietly no-ops (no image), it
// never falls back onto the public storefront's key/channel.
const EVENTS_MEDUSA_PUBLISHABLE_KEY = process.env.EVENTS_MEDUSA_PUBLISHABLE_KEY || '';

export type TierProductImages = {
    /** Web-sized opt/*.webp URL (or the original, unchanged, if it isn't a
     * products-bucket object the opt/ convention applies to). Primary src. */
    thumbnail: string | null;
    /** Untouched original — onError fallback for `thumbnail`. */
    thumbnailOriginal: string | null;
    /** Same derivation as `thumbnail`, one per original, same order/length
     * as `imagesOriginal` (index-paired for onError fallback). */
    images: string[];
    imagesOriginal: string[];
};

const EMPTY: TierProductImages = { thumbnail: null, thumbnailOriginal: null, images: [], imagesOriginal: [] };

/**
 * Resolve a batch of event-tier Medusa product ids to their display images.
 * Products that don't come back (deleted/unpublished/unreachable) are simply
 * absent from the result map — callers treat a missing id as "no image".
 */
export async function fetchEventTierProductImages(
    productIds: (string | null | undefined)[],
): Promise<Record<string, TierProductImages>> {
    const unique = [...new Set(productIds.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0 || !EVENTS_MEDUSA_PUBLISHABLE_KEY) return {};

    try {
        const url = new URL(`${MEDUSA_URL}/store/products`);
        url.searchParams.set('limit', String(Math.min(unique.length, 100)));
        url.searchParams.set('fields', 'id,thumbnail,*images');
        for (const id of unique) url.searchParams.append('id[]', id);

        const res = await fetch(url.toString(), {
            headers: {
                'x-publishable-api-key': EVENTS_MEDUSA_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
            },
            // 10-minute Data Cache entry — product photos don't change often
            // enough to justify a fresh Medusa round trip on every page view.
            next: { revalidate: 600 },
            // Never let a slow Medusa hold up the event page (or the app's
            // tier-media request) render.
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return {};

        const json = await res.json();
        const out: Record<string, TierProductImages> = {};
        for (const p of json?.products ?? []) {
            if (!p?.id) continue;

            const rawThumb: string | null =
                typeof p.thumbnail === 'string' && p.thumbnail.length > 0 ? p.thumbnail : null;
            const rawImages: string[] = (Array.isArray(p.images) ? p.images : [])
                .map((i: any) => i?.url)
                .filter((u: any): u is string => typeof u === 'string' && u.length > 0);

            // Thumbnail first, then the rest of the gallery, deduped.
            const originals: string[] = [];
            if (rawThumb) originals.push(rawThumb);
            for (const u of rawImages) if (!originals.includes(u)) originals.push(u);

            if (originals.length === 0) {
                out[p.id] = EMPTY;
                continue;
            }

            const derived = originals.map((u) => optimizedSrc(u) || u);
            out[p.id] = {
                thumbnail: derived[0] ?? null,
                thumbnailOriginal: originals[0] ?? null,
                images: derived,
                imagesOriginal: originals,
            };
        }
        return out;
    } catch {
        // Timeout, network error, or malformed response — no image, no throw.
        return {};
    }
}
