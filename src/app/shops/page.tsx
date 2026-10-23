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
import { ArrowRight, BadgeCheck, MapPin, Star, Store } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { Card, Chip, GlideButton, IconRoundel, SecButton } from '@/components/glide/primitives';
import { ViewToggle } from '@/components/glide-discover/ui';
import { dioramaFor } from '@/components/glide-discover/dioramas';

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

    const { data: shopsRaw, error: shopsError } = await admin
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
    if (shopsError) console.error('[shops] directory load failed:', shopsError.message);

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

    if (pagesRes.error) console.error('[shops] shop pages load failed:', pagesRes.error.message);
    if (statsRes.error) console.error('[shops] review stats load failed:', statsRes.error.message);

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

export const metadata: Metadata = {
    title: 'Car Wrap, PPF & Detail Shops',
    description:
        'Find vehicle wrap, paint protection film, ceramic coating, and tint shops near you on Rollout — with ratings, locations, and online booking.',
    alternates: { canonical: '/shops' },
    openGraph: {
        url: '/shops',
        title: 'Car Wrap, PPF & Detail Shops · Rollout',
        description:
            'Find vehicle wrap, PPF, ceramic, and tint shops near you on Rollout — ratings, locations, and booking.',
        type: 'website',
    },
};

export default async function ShopsDirectoryPage() {
    const shops = await loadShops();

    return (
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <header className="gd-head">
                    <div>
                        <h1>Shops</h1>
                        <p>
                            {shops.length > 0 ? (
                                <>
                                    <span className="g-w">{shops.length}</span> verified {shops.length === 1 ? 'shop' : 'shops'} · A to Z ·{' '}
                                </>
                            ) : null}
                            Wraps, paint protection film, ceramic coating, tint and more. Check the reviews and book online.
                        </p>
                    </div>
                    <ViewToggle current="list" listHref="/shops" mapHref="/meets/map" />
                </header>

                {shops.length === 0 ? (
                    <Card className="gd-empty" style={{ marginTop: 20 }}>
                        <IconRoundel>
                            <Store size={21} strokeWidth={1.75} />
                        </IconRoundel>
                        <span>
                            <b>No shops listed yet</b>
                            Check back soon, or list your own shop.
                        </span>
                    </Card>
                ) : (
                    <ul className="gd-shops">
                        {shops.map((s) => (
                            <li key={s.id}>
                                <ShopDirectoryCard shop={s} />
                            </li>
                        ))}
                    </ul>
                )}

                <div className="gd-pair">
                    <Card edge>
                        <h2>See every shop on the map</h2>
                        <p>Shops and meets plotted together. Find what is near you and plan the drive.</p>
                        <div className="gd-acts">
                            <GlideButton href="/meets/map" size="sm">
                                Open the map
                            </GlideButton>
                        </div>
                    </Card>
                    <Card>
                        <h2>Run a shop?</h2>
                        <p>Get on the map, take bookings, message customers and sell, all from one console.</p>
                        <div className="gd-acts">
                            <SecButton href="/shop/apply">
                                <Store size={18} strokeWidth={1.75} aria-hidden="true" />
                                List your shop
                            </SecButton>
                            <Link href="/shop/login" className="g-link">
                                Shop console
                                <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

/* ── Card ─────────────────────────────────────────────────────────────── */
function ShopDirectoryCard({ shop: s }: { shop: ShopCard }) {
    const locationText = [s.city, s.state_region].filter(Boolean).join(', ') || s.region || '';
    const isArea = s.location_precision === 'area';
    const name = s.name ?? s.slug;
    const dio = dioramaFor(s.slug);
    // Area shops are city-level presence: online-based, the city, never a street.
    const where = isArea ? ['Online', locationText ? `based in ${locationText}` : null].filter(Boolean).join(' · ') : locationText || 'Online';

    const inner = (
        <>
            <span className={dio ? 'gd-shop-im gd-shop-im--dio' : 'gd-shop-im'}>
                {dio ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="g-only-light" src={dio.day} alt="" loading="lazy" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="g-only-dark" src={dio.night} alt="" loading="lazy" />
                    </>
                ) : (
                    <span className="gd-logo">
                        {s.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.avatar_url} alt="" loading="lazy" />
                        ) : (
                            (name ?? '?').trim().charAt(0).toUpperCase()
                        )}
                    </span>
                )}
            </span>
            <span className="gd-shop-tx">
                <span className="gd-shop-nm">
                    <b>{name}</b>
                    {s.is_verified ? <BadgeCheck size={19} strokeWidth={2} aria-label="Verified shop" /> : null}
                </span>
                <small>
                    <MapPin size={14} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4, color: 'var(--icon)' }} />
                    {where}
                </small>
                <span className="g-chips">
                    {s.rating_count > 0 ? (
                        <Chip icon={<Star size={14} strokeWidth={2} fill="currentColor" aria-hidden="true" className="gd-star" />}>
                            <span className="g-w">{s.rating_avg.toFixed(1)}</span> · {s.rating_count} {s.rating_count === 1 ? 'review' : 'reviews'}
                        </Chip>
                    ) : (
                        <Chip>No reviews yet</Chip>
                    )}
                    {s.offers_services ? <Chip>Services</Chip> : null}
                    {s.sells_products ? <Chip>Store</Chip> : null}
                </span>
            </span>
        </>
    );

    return s.handle ? (
        <Link href={`/u/${s.handle}`} className="gd-shop">
            {inner}
        </Link>
    ) : (
        <div className="gd-shop">{inner}</div>
    );
}
