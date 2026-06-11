/**
 * /shops — public directory of shops on Rollout.
 *
 * Lists every map-visible shop (show_on_map) with a known location, joined to
 * its public @handle and review stats. SEO-targeted so "<city> car wrap shop"
 * style searches can find the directory + individual /u/[handle] pages.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Render at request time, not build time: this page reads via the service-role
// admin client whose key is runtime-only on Coolify. Static prerender at build
// would have no key and fail. Still fully SSR/crawlable for SEO.
export const dynamic = 'force-dynamic';

type ShopRow = {
    id: number;
    slug: string;
    name: string | null;
    region: string | null;
    city: string | null;
    state_region: string | null;
    address_line: string | null;
    primary_color: string | null;
};

type ShopCard = ShopRow & {
    handle: string | null;
    is_verified: boolean;
    rating_avg: number;
    rating_count: number;
};

async function loadShops(): Promise<ShopCard[]> {
    const admin = getSupabaseAdmin();

    const { data: shopsRaw } = await admin
        .from('shops')
        .select('id, slug, name, region, city, state_region, address_line, primary_color')
        .eq('show_on_map', true)
        .not('lat', 'is', null)
        .order('name', { ascending: true })
        .limit(200);

    const shops = (shopsRaw as ShopRow[]) ?? [];
    if (shops.length === 0) return [];

    const ids = shops.map((s) => s.id);

    const [pagesRes, statsRes] = await Promise.all([
        admin
            .from('profiles')
            .select('shop_id, handle, is_verified')
            .eq('kind', 'shop_page')
            .in('shop_id', ids),
        admin
            .from('shop_review_stats')
            .select('shop_id, rating_avg, rating_count')
            .in('shop_id', ids),
    ]);

    const pageByShop = new Map<number, { handle: string; is_verified: boolean }>();
    for (const p of (pagesRes.data as any[]) ?? []) {
        pageByShop.set(p.shop_id, { handle: p.handle, is_verified: !!p.is_verified });
    }
    const statByShop = new Map<number, { rating_avg: number; rating_count: number }>();
    for (const st of (statsRes.data as any[]) ?? []) {
        statByShop.set(st.shop_id, {
            rating_avg: Number(st.rating_avg ?? 0),
            rating_count: Number(st.rating_count ?? 0),
        });
    }

    return shops.map((s) => ({
        ...s,
        handle: pageByShop.get(s.id)?.handle ?? null,
        is_verified: pageByShop.get(s.id)?.is_verified ?? false,
        rating_avg: statByShop.get(s.id)?.rating_avg ?? 0,
        rating_count: statByShop.get(s.id)?.rating_count ?? 0,
    }));
}

function stars(rating: number): string {
    const r = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

export const metadata: Metadata = {
    title: 'Car Wrap, PPF & Detail Shops · Rollout',
    description:
        'Find vehicle wrap, paint protection film, ceramic coating, and tint shops near you on Rollout — with ratings, locations, and online booking.',
    openGraph: {
        title: 'Car Wrap, PPF & Detail Shops · Rollout',
        description:
            'Find vehicle wrap, PPF, ceramic, and tint shops near you on Rollout — ratings, locations, and booking.',
        type: 'website',
    },
};

export default async function ShopsDirectoryPage() {
    const shops = await loadShops();

    return (
        <>
            {/* HERO */}
            <section style={{ background: 'linear-gradient(135deg, var(--gold) 0%, #000 60%)', borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ padding: '64px 0 48px' }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ SHOPS</div>
                    <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: 1, margin: 0 }}>
                        SHOPS ON ROLLOUT
                    </h1>
                    <p style={{ color: 'var(--text-2)', fontSize: 16, marginTop: 14, maxWidth: 620 }}>
                        Vehicle wraps, paint protection film, ceramic coating, tint, and more —
                        find a shop near you, check the reviews, and book in the app.
                    </p>
                </div>
            </section>

            {/* LIST */}
            <section className="section" style={{ padding: '48px 0' }}>
                <div className="container">
                    {shops.length === 0 ? (
                        <div className="admin-empty">No shops on the map yet. Check back soon.</div>
                    ) : (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                gap: 16,
                            }}
                        >
                            {shops.map((s) => {
                                const inner = (
                                    <article
                                        className="feature-card corner-wrap"
                                        style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}
                                    >
                                        <span className="corner-bottom-left" />
                                        <span className="corner-bottom-right" />
                                        <div className="mono-row" style={{ fontSize: 10 }}>
                                            <span className="accent">SHOP</span>
                                            {s.is_verified ? (
                                                <>
                                                    <span className="sep" />
                                                    <span className="accent">VERIFIED</span>
                                                </>
                                            ) : null}
                                            {s.region ? (
                                                <>
                                                    <span className="sep" />
                                                    <span>{s.region}</span>
                                                </>
                                            ) : null}
                                        </div>
                                        <h3 style={{ fontSize: 19, letterSpacing: 0.6, margin: 0, color: 'var(--text)' }}>
                                            {(s.name ?? s.slug).toUpperCase()}
                                        </h3>
                                        <div className="text-dim" style={{ fontSize: 13 }}>
                                            {[s.address_line, s.city, s.state_region].filter(Boolean).join(', ') || '—'}
                                        </div>
                                        <div className="mono-row" style={{ fontSize: 12, marginTop: 'auto', paddingTop: 8 }}>
                                            <span className="accent" style={{ letterSpacing: 2 }}>{stars(s.rating_avg)}</span>
                                            <span className="sep" />
                                            <span>
                                                {s.rating_count > 0
                                                    ? `${s.rating_avg.toFixed(1)} · ${s.rating_count} ${s.rating_count === 1 ? 'REVIEW' : 'REVIEWS'}`
                                                    : 'NO REVIEWS YET'}
                                            </span>
                                        </div>
                                    </article>
                                );
                                return s.handle ? (
                                    <Link key={s.id} href={`/u/${s.handle}`} style={{ textDecoration: 'none', display: 'block' }}>
                                        {inner}
                                    </Link>
                                ) : (
                                    <div key={s.id}>{inner}</div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
