/**
 * Store product card in Glide (board G5 "More from …" cards): image on a
 * rounded tile, name, price in Michroma. Same rules as components/ProductCard:
 *  - a paused product stays on the shelf, linkable, with a "Coming soon"
 *    pill and no buy affordance;
 *  - a DEALER-ONLY product's price is hidden by default for every viewer
 *    (wholesale information); a caller that has checked dealer standing may
 *    pass `revealDealerPrice`.
 * A product with no photo gets a plain tile with a package icon.
 */
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Package } from 'lucide-react';
import type { MedusaProduct } from '@/lib/medusa';
import { formatMoney } from '@/lib/medusa';
import './tickets.css';

export function StoreProductCard({
    product,
    revealDealerPrice = false,
    priority = false,
}: {
    product: MedusaProduct;
    revealDealerPrice?: boolean;
    /** First row above the fold: load eagerly (it is the largest paint). */
    priority?: boolean;
}) {
    const { paused } = product;
    const hidePrice = product.dealerOnly && !revealDealerPrice;
    return (
        <Link href={`/store/p/${product.handle}`} className="gt-pc">
            <span className={`gt-pc-im${paused ? ' is-paused' : ''}`}>
                {product.thumbnail ? (
                    <Image
                        src={product.thumbnail}
                        alt=""
                        fill
                        {...(priority ? { priority: true } : { loading: 'lazy' as const })}
                        sizes="(max-width: 900px) 50vw, (max-width: 1440px) 25vw, 300px"
                    />
                ) : (
                    <span className="gt-pc-ph" aria-hidden="true">
                        <Package size={36} strokeWidth={1.4} />
                    </span>
                )}
                {paused ? (
                    <span className="gt-pc-tag g-fp">
                        <Clock size={15} strokeWidth={2} aria-hidden="true" />
                        Coming soon
                    </span>
                ) : null}
            </span>
            <b>{product.title}</b>
            <span className="gt-pc-pr">
                {hidePrice ? <small>Dealer pricing</small> : <span className="g-w">{formatMoney(product.price, product.currency)}</span>}
            </span>
        </Link>
    );
}
