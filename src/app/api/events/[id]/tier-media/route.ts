/**
 * GET /api/events/[id]/tier-media — public, read-only tier package photos.
 *
 * Exists so the mobile app can show the same Medusa product thumbnail the
 * web event page shows, WITHOUT the app ever holding a Medusa credential.
 * The Events channel's publishable key (EVENTS_MEDUSA_PUBLISHABLE_KEY) is
 * server-only (see lib/event-cart.ts, lib/event-tier-images.ts) and this
 * route is the one place it's allowed to leave the web server: it fetches
 * the product images itself and hands back plain image URLs, never the key.
 *
 * Response: { [tierId]: { thumbnail, thumbnailOriginal, images, imagesOriginal } }
 * for every ACTIVE tier of the event that has a medusa_product_id — a tier
 * with no product, or whose product fetch found no images, is simply absent
 * (the app renders that tier's card with no image). Bad/unknown event id,
 * DB error, or a Medusa failure inside fetchEventTierProductImages all
 * resolve to `{}` with a 200 — this endpoint has nothing to be "down" for
 * other than an empty result.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchEventTierProductImages, type TierProductImages } from '@/lib/event-tier-images';

// Product photos change rarely; cache each event's response for 10 minutes,
// matching the Medusa fetch cache inside fetchEventTierProductImages.
export const revalidate = 600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const headers = {
        'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
    };

    if (!UUID_RE.test(id)) {
        return NextResponse.json({}, { headers });
    }

    try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('event_tiers')
            .select('id, medusa_product_id')
            .eq('event_id', id)
            .eq('active', true);
        if (error || !Array.isArray(data) || data.length === 0) {
            return NextResponse.json({}, { headers });
        }

        const tiers = data as { id: string; medusa_product_id: string | null }[];
        const imagesByProduct = await fetchEventTierProductImages(tiers.map((t) => t.medusa_product_id));

        const out: Record<string, TierProductImages> = {};
        for (const t of tiers) {
            if (!t.medusa_product_id) continue;
            const img = imagesByProduct[t.medusa_product_id];
            if (img && (img.thumbnail || img.images.length > 0)) out[t.id] = img;
        }
        return NextResponse.json(out, { headers });
    } catch {
        return NextResponse.json({}, { headers });
    }
}
