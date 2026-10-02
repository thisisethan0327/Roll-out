/**
 * /store/p/[handle] — product detail (PDP).
 *
 * Gallery + option/variant selection + price, with vendor (shop) attribution,
 * a link back to the shop's /u page, and a link to the product's official
 * page on the seller's own site (lib/store-shops officialListing). Paused
 * products show COMING SOON and expose no purchase control — the pause gate is
 * also re-enforced server-side in the addToCart action.
 */
import type { Metadata } from 'next';
import { unityConfiguratorHandoffUrl } from '@/lib/sso-handoff';
import { getSupabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProductByHandle, formatMoney } from '@/lib/medusa';
import { getSellingShops, officialListing, resolveVendorShop } from '@/lib/store-shops';
import { ROLLOUT_ORIGIN } from '@/lib/tenant-hosts';
import { UNITY_ORG_ID, absoluteUrl, jsonLdHtml } from '@/lib/structured-data';
import { CartLink } from '../../CartLink';
import { AddToCartClient } from './AddToCartClient';
import { configuratorUrl } from '@/lib/medusa';
import { getDealerStatus } from '@/lib/medusa-customer';
import { ProductGallery } from './ProductGallery';

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
        title: `${product.title} · Store`,
        description: desc,
        // A marketplace listing is its own page (decision 2026-10-01): it is
        // indexable and canonical to itself; the page body credits the seller
        // (offers.seller) and links the official page on the seller's site.
        alternates: { canonical: `/store/p/${product.handle}` },
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

    // Dealer standing decides whether a dealer-only product is offered or
    // explained. Looked up only for the products that need it; the backend
    // enforces the rule regardless of what this returns.
    const dealer = product.dealerOnly
        ? await getDealerStatus()
        : { signedIn: false, isDealer: false, tier: null };

    // A kit / Printable PPF is configured on unityusa.co. With a Rollout session
    // the door goes through the ecosystem broker so the visitor arrives signed
    // in and ready to add to cart (Ethan); signed out, the plain link.
    let configureHref = configuratorUrl(product.handle);
    if (product.needsConfigurator) {
        const supabase = await getSupabaseServer();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        const viaBroker = user ? unityConfiguratorHandoffUrl(product.handle ?? '', process.env.NEXT_PUBLIC_SSO_BROKER_ORIGIN) : null;
        if (viaBroker) configureHref = viaBroker;
    }
    /**
     * A dealer-only product's PRICE is dealer information, whether or not the
     * product is currently sellable — unityusa.co hides the number behind the
     * same gate, and a wholesale price on a public page is the kind of thing a
     * competitor reads once and keeps. Independent of `paused`: pausing changes
     * whether anyone can buy, not who may see the number.
     */
    const hidePrice = product.dealerOnly && !dealer.isDealer;

    const shops = await getSellingShops();
    const vendor = resolveVendorShop(product.categoryHandles, shops);
    const official = vendor ? officialListing(vendor, product.handle) : null;

    // Product structured data. The seller is the shop that sells and ships it
    // (the "Sold and shipped by" line) — never Rollout. Prices only when the
    // page shows them; availability only when it can be bought on this page at
    // all. A listing with no visible price (a dealer-only product while its
    // price is hidden, or no priced variant) or no known seller gets NO Product
    // markup: an Offer must carry a price, and a Product with neither an offer
    // nor a rating is an invalid item, so half the markup would only surface as
    // Search Console errors. The visible seller line and the official-page link
    // below still credit the seller either way.
    const pageUrl = `${ROLLOUT_ORIGIN}/store/p/${product.handle}`;
    const buyableHere = !product.paused && !product.needsConfigurator && !hidePrice;
    const variantPrices = product.variants.map((v) => v.price).filter((p): p is number => p != null);
    const currency = (product.currency ?? 'usd').toUpperCase();
    const priceFields =
        hidePrice || variantPrices.length === 0
            ? null
            : Math.min(...variantPrices) === Math.max(...variantPrices)
              ? { '@type': 'Offer', price: variantPrices[0].toFixed(2), priceCurrency: currency }
              : {
                    '@type': 'AggregateOffer',
                    lowPrice: Math.min(...variantPrices).toFixed(2),
                    highPrice: Math.max(...variantPrices).toFixed(2),
                    offerCount: variantPrices.length,
                    priceCurrency: currency,
                };
    const images = product.images
        .slice(0, 8)
        .map((src) => absoluteUrl(src))
        .filter((src): src is string => src != null);
    const productLd =
        vendor && priceFields
            ? {
                  '@context': 'https://schema.org',
                  '@type': 'Product',
                  name: product.title,
                  url: pageUrl,
                  ...(images.length > 0 ? { image: images } : {}),
                  ...(product.description ? { description: product.description } : {}),
                  ...(official?.productUrl ? { sameAs: [official.productUrl] } : {}),
                  offers: {
                      ...priceFields,
                      url: pageUrl,
                      ...(buyableHere
                          ? {
                                availability: product.variants.some((v) => v.inStock)
                                    ? 'https://schema.org/InStock'
                                    : 'https://schema.org/OutOfStock',
                            }
                          : {}),
                      seller: {
                          '@type': 'Organization',
                          ...(vendor.slug === 'unityusa' ? { '@id': UNITY_ORG_ID } : {}),
                          name: vendor.name,
                          ...(official?.siteUrl ? { url: official.siteUrl } : {}),
                      },
                  },
              }
            : null;

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
                    <ProductGallery
                        images={product.images}
                        title={product.title}
                        paused={product.paused}
                    />

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
                                {hidePrice ? 'Dealer pricing' : formatMoney(product.price, product.currency)}
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
                            // Dealer-only is shown as closed ONLY to people who
                            // are not dealers; a dealer buys it here normally.
                            dealerLocked={product.dealerOnly && !dealer.isDealer}
                            dealerSignedIn={dealer.signedIn}
                            needsConfigurator={product.needsConfigurator}
                            configuratorUrl={configureHref}
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
                                .
                                {official?.productUrl && official.label ? (
                                    <>
                                        {' '}Official product page on{' '}
                                        <a href={official.productUrl} target="_blank" rel="noopener" style={{ color: 'var(--gold)' }}>
                                            {official.label}
                                        </a>
                                        .
                                    </>
                                ) : official?.siteUrl && official.label ? (
                                    <>
                                        {' '}More from {vendor.name} at{' '}
                                        <a href={official.siteUrl} target="_blank" rel="noopener" style={{ color: 'var(--gold)' }}>
                                            {official.label}
                                        </a>
                                        .
                                    </>
                                ) : null}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
            {/* Structured data last, as on /event and /u (scroll-to-top). */}
            {productLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(productLd) }} /> : null}
        </section>
    );
}
