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
import { ArrowRight, Package, Store } from 'lucide-react';
import { getSellingShops } from '@/lib/store-shops';
import { fetchCatalogByHandles, type MedusaProduct } from '@/lib/medusa';
import { StoreProductCard } from '@/components/glide-tickets/StoreProductCard';
import { EmptyState, ErrorLine, PageHead } from '@/components/glide-tickets/parts';
import { CartLink } from '../CartLink';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Store — shop the brands on Rollout',
    description:
        'Shop apparel, wheels, and gear from the brands on Rollout — NeferStock, divine DESIGN WHEELS, and more. One checkout, shipped from the shop.',
    alternates: { canonical: '/store' },
    openGraph: {
        url: '/store',
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
        <div className="glide glide-page">
            <div className="g-wrap gt-page">
                <PageHead
                    title="Store"
                    sub="Gear from the brands on Rollout. One checkout, and each order ships from the shop that made it."
                    actions={<CartLink />}
                />

                {/* Shop filter chips */}
                <nav className="gt-fchips" aria-label="Filter by shop">
                    <FilterChip label="All shops" href="/store" active={!shopFilter} />
                    {shops.map((s) => (
                        <FilterChip
                            key={s.slug}
                            label={s.name}
                            href={`/store?shop=${s.slug}`}
                            active={shopFilter === s.slug}
                        />
                    ))}
                </nav>

                {/* CATALOGS */}
                {catalogs.length === 0 ? (
                    <EmptyState icon={<Store size={28} strokeWidth={1.5} />} title="No shops selling yet">
                        Check back soon.
                    </EmptyState>
                ) : (
                    catalogs.map(({ shop, products, error }, bi) => (
                        <ShopBlock
                            key={shop.slug}
                            first={bi === 0}
                            shopName={shop.name}
                            shopHandle={shop.handle}
                            products={products}
                            error={error}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
    return (
        <Link href={href} className="gt-fchip" aria-current={active ? 'true' : undefined}>
            {label}
        </Link>
    );
}

function ShopBlock({
    shopName,
    shopHandle,
    products,
    error,
    first = false,
}: {
    first?: boolean;
    shopName: string;
    shopHandle: string;
    products: MedusaProduct[];
    error: string | null;
}) {
    const id = `shop-${shopHandle}`;
    return (
        <section className="gt-shopblock" aria-labelledby={id}>
            <div className="gt-sh">
                <h2 id={id}>{shopName}</h2>
                <Link href={`/u/${shopHandle}`} className="g-link">
                    Visit shop
                    <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                </Link>
            </div>

            {error ? (
                <ErrorLine live={false}>Catalog unavailable right now. {error}</ErrorLine>
            ) : products.length === 0 ? (
                <EmptyState icon={<Package size={28} strokeWidth={1.5} />} title="No products yet">
                    {shopName} has not listed anything here yet.
                </EmptyState>
            ) : (
                <ul className="gt-grid">
                    {products.map((p, i) => (
                        <li key={p.id}>
                            <StoreProductCard product={p} priority={first && i < 5} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
