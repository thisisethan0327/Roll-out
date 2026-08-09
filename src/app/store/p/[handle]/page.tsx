/**
 * /store/p/[handle] — product detail (PDP).
 *
 * Gallery + option/variant selection + price, with vendor (shop) attribution
 * and a link back to the shop's /u page. Paused products show COMING SOON and
 * expose no purchase control — the pause gate is also re-enforced server-side
 * in the addToCart action.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProductByHandle, formatMoney } from '@/lib/medusa';
import { getSellingShops, resolveVendorShop } from '@/lib/store-shops';
import { CartLink } from '../../CartLink';
import { AddToCartClient } from './AddToCartClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ handle: string }>;
}): Promise<Metadata> {
    const { handle } = await params;
    const product = await fetchProductByHandle(handle);
    if (!product) return { title: 'Product not found' };
    const desc = (product.description || `Shop ${product.title} on Rollout.`).slice(0, 160);
    return {
        title: `${product.title} · Rollout Store`,
        description: desc,
        openGraph: {
            title: product.title,
            description: desc,
            images: product.thumbnail ? [product.thumbnail] : undefined,
            type: 'website',
        },
    };
}

export default async function ProductDetailPage({
    params,
}: {
    params: Promise<{ handle: string }>;
}) {
    const { handle } = await params;
    const product = await fetchProductByHandle(handle);
    if (!product) notFound();

    const shops = await getSellingShops();
    const vendor = resolveVendorShop(product.categoryHandles, shops);

    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <div className="container">
                {/* breadcrumb + cart */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 28,
                        flexWrap: 'wrap',
                    }}
                >
                    <div className="mono-row" style={{ fontSize: 11 }}>
                        <Link href="/store" style={{ color: 'var(--text-2)', textDecoration: 'none' }}>
                            STORE
                        </Link>
                        {vendor ? (
                            <>
                                <span className="sep" />
                                <Link
                                    href={`/store?shop=${vendor.slug}`}
                                    style={{ color: 'var(--gold)', textDecoration: 'none' }}
                                >
                                    {vendor.name.toUpperCase()}
                                </Link>
                            </>
                        ) : null}
                    </div>
                    <CartLink />
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
                        gap: 40,
                        alignItems: 'start',
                    }}
                    className="pdp-grid"
                >
                    {/* GALLERY */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div
                            className="corner-wrap"
                            style={{
                                position: 'relative',
                                aspectRatio: '1 / 1',
                                background: product.images[0]
                                    ? `url(${product.images[0]}) center/cover no-repeat`
                                    : 'var(--bg-3)',
                                border: '1px solid var(--line)',
                                filter: product.paused ? 'grayscale(0.85) brightness(0.6)' : 'none',
                            }}
                        >
                            <span className="corner-bottom-left" />
                            <span className="corner-bottom-right" />
                            {product.paused ? (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span
                                        style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: 13,
                                            fontWeight: 700,
                                            letterSpacing: 'var(--track-wider)',
                                            padding: '8px 18px',
                                            border: '1px solid var(--gold)',
                                            background: 'rgba(0,0,0,0.72)',
                                            color: 'var(--gold)',
                                        }}
                                    >
                                        COMING SOON
                                    </span>
                                </div>
                            ) : null}
                        </div>
                        {product.images.length > 1 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                                {product.images.slice(1, 7).map((img, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            aspectRatio: '1 / 1',
                                            background: `url(${img}) center/cover no-repeat`,
                                            border: '1px solid var(--line)',
                                        }}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {/* INFO + BUY */}
                    <div>
                        <div className="eyebrow eyebrow-gold mb-4">
                            {vendor ? `／ ${vendor.name}` : '／ PRODUCT'}
                        </div>
                        <h1 style={{ fontSize: 'clamp(24px, 3vw, 36px)', letterSpacing: 0.5, margin: '0 0 12px' }}>
                            {product.title}
                        </h1>
                        <div className="mono-row" style={{ fontSize: 15, marginBottom: 20 }}>
                            <span className="accent" style={{ fontSize: 20 }}>
                                {formatMoney(product.price, product.currency)}
                            </span>
                            {product.paused ? (
                                <>
                                    <span className="sep" />
                                    <span className="text-dim">COMING SOON</span>
                                </>
                            ) : null}
                        </div>

                        {product.description ? (
                            <p style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
                                {product.description}
                            </p>
                        ) : null}

                        <AddToCartClient
                            paused={product.paused}
                            options={product.options}
                            variants={product.variants}
                            currency={product.currency}
                        />

                        {vendor ? (
                            <p className="text-dim" style={{ fontSize: 12, marginTop: 22 }}>
                                Sold and shipped by{' '}
                                <Link href={`/u/${vendor.handle}`} style={{ color: 'var(--gold)' }}>
                                    {vendor.name}
                                </Link>
                                . One shop per order.
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
