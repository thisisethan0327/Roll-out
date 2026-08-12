/**
 * /shops — public directory of shops on Rollout.
 *
 * Lists every verified, map-visible shop (show_on_map) — including shops that
 * have no geocoded coordinates yet (e.g. approved via /shop/apply before their
 * address is geocoded). Joined to its public @handle, shop_page avatar (logo),
 * verification, review stats, and service capabilities. Coord-less shops still
 * get a card (degraded to city/region text or an ONLINE tag); the map at
 * /meets/map is a separate data path that only pins shops with lat/lng.
 * SEO-targeted so "<city> car wrap shop" style searches can find the directory
 * + individual /u/[handle] pages.
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
    offers_services: boolean | null;
    sells_products: boolean | null;
    location_precision: string | null;
};

type ShopCard = ShopRow & {
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    rating_avg: number;
    rating_count: number;
};

async function loadShops(): Promise<ShopCard[]> {
    const admin = getSupabaseAdmin();

    const { data: shopsRaw } = await admin
        .from('shops')
        .select(
            'id, slug, name, region, city, state_region, address_line, primary_color, offers_services, sells_products, location_precision',
        )
        // Only verified shops are publicly listed — pending/suspended/rejected
        // applications never surface in the directory (service-role bypasses RLS,
        // so the gate must live in the query). show_on_map stays the opt-out
        // visibility flag. We intentionally do NOT require lat to be set: a
        // verified shop without geocoded coords still belongs in the directory
        // (it just can't be pinned on the map — its card degrades gracefully).
        .eq('status', 'verified')
        .eq('show_on_map', true)
        .order('name', { ascending: true })
        .limit(200);

    const shops = (shopsRaw as ShopRow[]) ?? [];
    if (shops.length === 0) return [];

    const ids = shops.map((s) => s.id);

    const [pagesRes, statsRes] = await Promise.all([
        admin
            .from('profiles')
            .select('shop_id, handle, is_verified, avatar_url')
            .eq('kind', 'shop_page')
            .in('shop_id', ids),
        admin
            .from('shop_review_stats')
            .select('shop_id, rating_avg, rating_count')
            .in('shop_id', ids),
    ]);

    const pageByShop = new Map<number, { handle: string; is_verified: boolean; avatar_url: string | null }>();
    for (const p of (pagesRes.data as any[]) ?? []) {
        pageByShop.set(p.shop_id, {
            handle: p.handle,
            is_verified: !!p.is_verified,
            avatar_url: p.avatar_url ?? null,
        });
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
        avatar_url: pageByShop.get(s.id)?.avatar_url ?? null,
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
                    {shops.length > 0 && (
                        <div className="mono-row" style={{ marginTop: 22 }}>
                            <span className="accent">{shops.length}</span>
                            <span>{shops.length === 1 ? 'SHOP LISTED' : 'SHOPS LISTED'}</span>
                            <span className="sep" />
                            <span>SEATTLE · PNW</span>
                        </div>
                    )}
                </div>
            </section>

            {/* LIST */}
            <section className="section" style={{ padding: '48px 0' }}>
                <div className="container">
                    {shops.length === 0 ? (
                        <div className="admin-empty">No shops on the map yet. Check back soon.</div>
                    ) : (
                        <div className="shop-grid">
                            {shops.map((s) => (
                                <ShopDirectoryCard key={s.id} shop={s} />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* MAP TEASER */}
            <section style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                <div
                    className="container shop-map-teaser"
                    style={{ padding: '56px 0' }}
                >
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div className="eyebrow eyebrow-gold mb-4">／ MAP</div>
                        <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', margin: 0 }}>
                            SEE EVERY SHOP ON THE MAP
                        </h2>
                        <p style={{ color: 'var(--text-2)', fontSize: 15, marginTop: 12, maxWidth: 520 }}>
                            Shops, meets, and convoys plotted together. Find what&apos;s near you and
                            plan the route.
                        </p>
                        <Link href="/meets/map" className="btn" style={{ marginTop: 22 }}>
                            Open The Map
                        </Link>
                    </div>
                    <div className="shop-map-glyph corner-wrap" aria-hidden>
                        <span className="corner-bottom-left" />
                        <span className="corner-bottom-right" />
                        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.2">
                            <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
                            <circle cx="12" cy="11" r="2.2" />
                        </svg>
                    </div>
                </div>
            </section>

            {/* RUN A SHOP CTA */}
            <section style={{ borderTop: '1px solid var(--line)' }}>
                <div
                    className="container shop-run-cta"
                    style={{ padding: '48px 0' }}
                >
                    <div>
                        <div className="eyebrow mb-4">／ FOR SHOPS</div>
                        <h3 style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', margin: 0 }}>
                            RUN A SHOP?
                        </h3>
                        <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 10, maxWidth: 480 }}>
                            Get on the map, take bookings, message customers, and sell — all from one
                            console.
                        </p>
                    </div>
                    <Link href="/shop/login" className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}>
                        Shop Console →
                    </Link>
                </div>
            </section>
        </>
    );
}

/* ── Card ─────────────────────────────────────────────────────────────── */
function ShopDirectoryCard({ shop: s }: { shop: ShopCard }) {
    const locationText = [s.city, s.state_region].filter(Boolean).join(', ') || s.region || '';
    const isArea = s.location_precision === 'area';
    const initial = (s.name ?? s.slug ?? '?').trim().charAt(0).toUpperCase();

    const inner = (
        <article className="shop-card feature-card corner-wrap">
            <span className="corner-bottom-left" />
            <span className="corner-bottom-right" />

            <div className="shop-card-head">
                <div className="shop-logo">
                    {s.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.avatar_url} alt={`${s.name ?? s.slug} logo`} loading="lazy" />
                    ) : (
                        <span className="shop-logo-fallback">{initial}</span>
                    )}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div className="mono-row" style={{ fontSize: 10 }}>
                        {s.is_verified ? (
                            <span className="accent">✓ VERIFIED</span>
                        ) : (
                            <span>SHOP</span>
                        )}
                        {s.region ? (
                            <>
                                <span className="sep" />
                                <span>{s.region}</span>
                            </>
                        ) : null}
                    </div>
                    <h3 style={{ fontSize: 18, letterSpacing: 0.5, margin: '6px 0 0', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(s.name ?? s.slug).toUpperCase()}
                    </h3>
                </div>
            </div>

            <div className="text-dim" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {isArea ? (
                    // City-level presence: online-based, show the city (never a
                    // street), tagged ONLINE so it reads as area not exact.
                    <>
                        <span className="shop-chip">ONLINE</span>
                        {locationText && <span>BASED IN {locationText}</span>}
                    </>
                ) : locationText ? (
                    <>
                        {/* Only show the map-pin affordance when we actually have a place. */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden style={{ flexShrink: 0 }}>
                            <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
                            <circle cx="12" cy="11" r="2" />
                        </svg>
                        {locationText}
                    </>
                ) : (
                    <span className="shop-chip">ONLINE</span>
                )}
            </div>

            {(s.offers_services || s.sells_products) && (
                <div className="shop-chips">
                    {s.offers_services && <span className="shop-chip">SERVICES</span>}
                    {s.sells_products && <span className="shop-chip">STORE</span>}
                </div>
            )}

            <div className="mono-row shop-card-foot" style={{ fontSize: 12 }}>
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
        <Link href={`/u/${s.handle}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
            {inner}
        </Link>
    ) : (
        <div style={{ height: '100%' }}>{inner}</div>
    );
}
