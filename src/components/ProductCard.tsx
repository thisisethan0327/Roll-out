import Link from 'next/link';
import Image from 'next/image';
import type { MedusaProduct } from '@/lib/medusa';
import { formatMoney } from '@/lib/medusa';

/**
 * Product card used on /store, filtered store views, and shop /u/[handle] pages.
 * Paused products stay on the shelf (visible + linkable) but wear a "COMING
 * SOON" veil and never expose a buy affordance — the founder's coming-soon gate
 * mirrored from the NeferStock storefront.
 */
export function ProductCard({ product }: { product: MedusaProduct }) {
    const { paused } = product;
    return (
        <Link
            href={`/store/p/${product.handle}`}
            style={{ textDecoration: 'none', display: 'block' }}
        >
            <article
                className="feature-card corner-wrap"
                style={{
                    padding: 0,
                    overflow: 'hidden',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <span className="corner-bottom-left" />
                <span className="corner-bottom-right" />
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: 'var(--bg-3)' }}>
                    {product.thumbnail ? (
                        <Image
                            src={product.thumbnail}
                            alt={product.title}
                            fill
                            loading="lazy"
                            sizes="(max-width: 600px) 50vw, (max-width: 1024px) 33vw, 300px"
                            style={{
                                objectFit: 'cover',
                                filter: paused ? 'grayscale(0.85) brightness(0.6)' : 'none',
                            }}
                        />
                    ) : null}
                    {paused ? (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <span
                                style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: 'var(--track-wider)',
                                    padding: '6px 14px',
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
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h3 style={{ fontSize: 15, letterSpacing: 0.4, margin: 0, color: 'var(--text)' }}>
                        {product.title}
                    </h3>
                    <div className="mono-row" style={{ fontSize: 12 }}>
                        <span className="accent">{formatMoney(product.price, product.currency)}</span>
                        {paused ? (
                            <>
                                <span className="sep" />
                                <span className="text-dim">COMING SOON</span>
                            </>
                        ) : null}
                    </div>
                </div>
            </article>
        </Link>
    );
}
