/**
 * /store — the Rollout marketplace index.
 *
 * Lists every selling shop (rollout.shops.sells_products) with its Medusa
 * catalog, grouped by shop and filterable via ?shop=<slug>. Catalogs are read
 * server-side against the Rollout sales channel (publishable key). Paused
 * products render with a COMING SOON veil (founder's coming-soon gate).
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSellingShops } from '@/lib/store-shops';
import { fetchCatalogByHandles, type MedusaProduct } from '@/lib/medusa';
import { ProductCard } from '@/components/ProductCard';
import { CartLink } from './CartLink';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Store — shop the brands on Rollout',
    description:
        'Shop apparel, wheels, and gear from the brands on Rollout — NeferStock, divine DESIGN WHEELS, and more. One checkout, shipped from the shop.',
    openGraph: {
        title: 'Store · Rollout',
        description: 'Shop the brands on Rollout — one checkout, shipped from the shop.',
        type: 'website',
    },
};

export default async function StoreIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ shop?: string }>;
}) {
    const { shop: shopFilter } = await searchParams;
    const shops = await getSellingShops();
    const visible = shopFilter ? shops.filter((s) => s.slug === shopFilter) : shops;

    const catalogs = await Promise.all(
        visible.map(async (s) => {
            const { products, error } = await fetchCatalogByHandles(s.categoryHandles);
            return { shop: s, products, error };
        }),
    );

    return (
        <>
            {/* HERO */}
            <section style={{ background: 'linear-gradient(135deg, var(--gold) 0%, #000 62%)', borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ padding: '56px 0 40px' }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ STORE</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                            <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: 1, margin: 0 }}>
                                THE STORE
                            </h1>
                            <p style={{ color: 'var(--text-2)', fontSize: 16, marginTop: 12, maxWidth: 560 }}>
                                Gear from the brands on Rollout. One checkout — each order ships from
                                the shop that made it.
                            </p>
                        </div>
                        <CartLink />
                    </div>

                    {/* Shop filter chips */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                        <FilterChip label="ALL SHOPS" href="/store" active={!shopFilter} />
                        {shops.map((s) => (
                            <FilterChip
                                key={s.slug}
                                label={s.name}
                                href={`/store?shop=${s.slug}`}
                                active={shopFilter === s.slug}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* CATALOGS */}
            <section className="section" style={{ padding: '40px 0 64px' }}>
                <div className="container">
                    {catalogs.length === 0 ? (
                        <div className="admin-empty">No shops selling yet. Check back soon.</div>
                    ) : (
                        catalogs.map(({ shop, products, error }) => (
                            <ShopBlock
                                key={shop.slug}
                                shopName={shop.name}
                                shopHandle={shop.handle}
                                products={products}
                                error={error}
                            />
                        ))
                    )}
                </div>
            </section>
        </>
    );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
    return (
        <Link
            href={href}
            className="font-display"
            style={{
                fontSize: 11,
                letterSpacing: 'var(--track-wider)',
                textTransform: 'uppercase',
                padding: '8px 14px',
                border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                background: active ? 'var(--gold-dim)' : 'transparent',
                color: active ? 'var(--gold)' : 'var(--text-2)',
                textDecoration: 'none',
            }}
        >
            {label}
        </Link>
    );
}

function ShopBlock({
    shopName,
    shopHandle,
    products,
    error,
}: {
    shopName: string;
    shopHandle: string;
    products: MedusaProduct[];
    error: string | null;
}) {
    return (
        <div style={{ marginBottom: 56 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 24,
                    flexWrap: 'wrap',
                }}
            >
                <h2 style={{ margin: 0, letterSpacing: 1 }}>{shopName.toUpperCase()}</h2>
                <Link
                    href={`/u/${shopHandle}`}
                    className="font-display"
                    style={{
                        fontSize: 11,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--gold)',
                        textDecoration: 'none',
                    }}
                >
                    VISIT SHOP →
                </Link>
            </div>

            {error ? (
                <div className="admin-empty">Catalog unavailable right now. {error}</div>
            ) : products.length === 0 ? (
                <div className="admin-empty">No products listed yet.</div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 16,
                    }}
                >
                    {products.map((p) => (
                        <ProductCard key={p.id} product={p} />
                    ))}
                </div>
            )}
        </div>
    );
}
