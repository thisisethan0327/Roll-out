import type { MetadataRoute } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSellingShops } from '@/lib/store-shops';
import { fetchCatalogByHandles } from '@/lib/medusa';
import { LEGAL } from '@/lib/legal';
import { isTestShop } from '@/lib/test-shops';
import { isSeedEvent } from '@/lib/seed-content';

/**
 * The sitemap: static routes, upcoming public events, shop pages, and the
 * store catalogue. Each dynamic source is best-effort — a failed read drops
 * that section rather than the whole file. Rebuilt hourly.
 *
 * Only pages meant to be found: no sign-up or shop-application doors (they are
 * forms, and /shop/apply bounces a visitor to /login), only shops that are
 * verified and not E2E harness shops (lib/test-shops), and only real meets —
 * not the preview seed's (lib/seed-content).
 *
 * lastModified is real or absent. It used to be "now" on every static URL,
 * every fetch, which tells a crawler nothing; now the legal pages carry their
 * documents' own dates, the listing pages the newest change among what they
 * list, and pages with no such date carry none.
 */
export const revalidate = 3600;

const BASE = 'https://rollout.club';

/** The newest of some timestamps, or undefined when there are none. */
function newest(stamps: Array<string | null | undefined>): Date | undefined {
    let best: number | undefined;
    for (const s of stamps) {
        const t = s ? Date.parse(s) : NaN;
        if (!Number.isNaN(t) && (best === undefined || t > best)) best = t;
    }
    return best === undefined ? undefined : new Date(best);
}

/** A lastModified field only when there is a real date for it. */
function modified(date: Date | string | null | undefined): { lastModified?: Date } {
    if (!date) return {};
    const d = date instanceof Date ? date : new Date(date);
    return Number.isNaN(d.getTime()) ? {} : { lastModified: d };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    const events: MetadataRoute.Sitemap = [];
    const shops: MetadataRoute.Sitemap = [];
    let eventsChanged: Date | undefined;
    let shopsChanged: Date | undefined;

    try {
        const supabase = getSupabaseAdmin();
        const [eventRows, pageRows, shopRows] = await Promise.all([
            supabase
                .from('event_cards')
                .select('id, host_id, tags, title, updated_at')
                .eq('visibility', 'public')
                .gte('start_at', new Date(now.getTime() - 86_400_000).toISOString())
                .order('start_at', { ascending: true })
                .limit(500),
            supabase.from('profiles').select('handle, updated_at, shop_id').eq('kind', 'shop_page').not('handle', 'is', null).limit(500),
            // The same gate /u/[handle] applies: a shop page renders only when
            // its shop is verified, so nothing else belongs in the sitemap.
            supabase.from('shops').select('id, slug, name').eq('status', 'verified').limit(1000),
        ]);
        const realEvents = (eventRows.data ?? []).filter((e) => !isSeedEvent(e));
        for (const e of realEvents) {
            events.push({ url: `${BASE}/event/${e.id}`, ...modified(e.updated_at), changeFrequency: 'daily', priority: 0.8 });
        }
        eventsChanged = newest(realEvents.map((e) => e.updated_at));

        const listed = new Set<number>();
        for (const s of shopRows.data ?? []) {
            if (!isTestShop(s)) listed.add(Number(s.id));
        }
        const pages = (pageRows.data ?? []).filter((p) => listed.has(Number(p.shop_id)));
        for (const s of pages) {
            const handle = String(s.handle).replace(/^@/, '');
            shops.push({ url: `${BASE}/u/${handle}`, ...modified(s.updated_at), changeFrequency: 'weekly', priority: 0.7 });
        }
        shopsChanged = newest(pages.map((p) => p.updated_at));
    } catch {
        // Supabase unreachable: the static routes still ship.
    }

    const out: MetadataRoute.Sitemap = [
        { url: BASE, changeFrequency: 'daily', priority: 1 },
        { url: `${BASE}/meets`, ...modified(eventsChanged), changeFrequency: 'hourly', priority: 0.9 },
        { url: `${BASE}/meets/map`, ...modified(eventsChanged), changeFrequency: 'hourly', priority: 0.6 },
        { url: `${BASE}/shops`, ...modified(shopsChanged), changeFrequency: 'daily', priority: 0.9 },
        { url: `${BASE}/store`, changeFrequency: 'daily', priority: 0.8 },
        { url: `${BASE}/help`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE}/terms`, ...modified(LEGAL.terms.updated), changeFrequency: 'yearly', priority: 0.2 },
        { url: `${BASE}/privacy`, ...modified(LEGAL.privacy.updated), changeFrequency: 'yearly', priority: 0.2 },
        { url: `${BASE}/guidelines`, ...modified(LEGAL.guidelines.updated), changeFrequency: 'yearly', priority: 0.2 },
        ...events,
        ...shops,
    ];

    // Store listings are marketplace pages for products sold by the shops on
    // Rollout; each is self-canonical and credits its seller (store/p). Only
    // verified, commerce-cleared shops sell (getSellingShops), so a pending
    // test shop's catalogue never reaches here. The catalogue read carries no
    // update time, so these carry no lastModified.
    try {
        const sellers = await getSellingShops();
        const seen = new Set<string>();
        for (const s of sellers) {
            if (isTestShop(s)) continue;
            const { products } = await fetchCatalogByHandles(s.categoryHandles);
            for (const p of products) {
                if (!p.handle || seen.has(p.handle)) continue;
                seen.add(p.handle);
                out.push({ url: `${BASE}/store/p/${p.handle}`, changeFrequency: 'weekly', priority: 0.6 });
            }
        }
    } catch {
        // Medusa unreachable: the catalogue section is dropped.
    }

    return out;
}
