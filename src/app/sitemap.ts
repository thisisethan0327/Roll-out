import type { MetadataRoute } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSellingShops } from '@/lib/store-shops';
import { fetchCatalogByHandles } from '@/lib/medusa';

/**
 * The sitemap: static routes, upcoming public events, shop pages, and the
 * store catalogue. Each dynamic source is best-effort — a failed read drops
 * that section rather than the whole file. Rebuilt hourly.
 */
export const revalidate = 3600;

const BASE = 'https://rollout.club';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    const out: MetadataRoute.Sitemap = [
        { url: BASE, lastModified: now, changeFrequency: 'daily', priority: 1 },
        { url: `${BASE}/meets`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
        { url: `${BASE}/meets/map`, lastModified: now, changeFrequency: 'hourly', priority: 0.6 },
        { url: `${BASE}/shops`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
        { url: `${BASE}/store`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
        { url: `${BASE}/help`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE}/shop/apply`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
        { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
        { url: `${BASE}/guidelines`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    ];

    try {
        const supabase = getSupabaseAdmin();
        const [events, shops] = await Promise.all([
            supabase
                .from('event_cards')
                .select('id, updated_at')
                .eq('visibility', 'public')
                .gte('start_at', new Date(now.getTime() - 86_400_000).toISOString())
                .order('start_at', { ascending: true })
                .limit(500),
            supabase.from('profiles').select('handle, updated_at').eq('kind', 'shop_page').not('handle', 'is', null).limit(500),
        ]);
        for (const e of events.data ?? []) {
            out.push({ url: `${BASE}/event/${e.id}`, lastModified: e.updated_at ? new Date(e.updated_at) : now, changeFrequency: 'daily', priority: 0.8 });
        }
        for (const s of shops.data ?? []) {
            const handle = String(s.handle).replace(/^@/, '');
            out.push({ url: `${BASE}/u/${handle}`, lastModified: s.updated_at ? new Date(s.updated_at) : now, changeFrequency: 'weekly', priority: 0.7 });
        }
    } catch {
        // Supabase unreachable: the static routes still ship.
    }

    try {
        const sellers = await getSellingShops();
        const seen = new Set<string>();
        for (const s of sellers) {
            const { products } = await fetchCatalogByHandles(s.categoryHandles);
            for (const p of products) {
                if (!p.handle || seen.has(p.handle)) continue;
                seen.add(p.handle);
                out.push({ url: `${BASE}/store/p/${p.handle}`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 });
            }
        }
    } catch {
        // Medusa unreachable: the catalogue section is dropped.
    }

    return out;
}
