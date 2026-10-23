/**
 * /store/cart — the bag. Server-fetches the cart from the cookie; the client
 * component handles quantity/remove mutations and the checkout hand-off.
 */
import type { Metadata } from 'next';
import { getCart } from '@/lib/medusa-cart';
import { CartClient } from './CartClient';
import { PageHead } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Cart · Store',
    robots: { index: false },
};

export default async function CartPage() {
    const cart = await getCart();
    const n = cart?.itemCount ?? 0;
    return (
        <div className="glide glide-page">
            <div className="g-wrap gt-page">
                <PageHead
                    back={{ href: '/store', label: 'Store' }}
                    title="Cart"
                    meta={n > 0 ? <span><span className="g-w">{n}</span> {n === 1 ? 'item' : 'items'}</span> : undefined}
                />
                <CartClient initialCart={cart} />
            </div>
        </div>
    );
}
