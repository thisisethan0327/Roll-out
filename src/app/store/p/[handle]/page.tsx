/**
 * /store/p/[handle] — product detail (PDP).
 *
 * Gallery + option/variant selection + price, with vendor (shop) attribution
 * and a link back to the shop's /u page. Paused products show COMING SOON and
 * expose no purchase control — the pause gate is also re-enforced server-side
 * in the addToCart action.
 */
import type { Metadata } from 'next';
import { unityConfiguratorHandoffUrl } from '@/lib/sso-handoff';
import { getSupabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProductByHandle, formatMoney } from '@/lib/medusa';
import { getSellingShops, resolveVendorShop } from '@/lib/store-shops';
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
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
