/**
 * /store/cart — the bag. Server-fetches the cart from the cookie; the client
 * component handles quantity/remove mutations and the checkout hand-off.
 */
import type { Metadata } from 'next';
import { getCart } from '@/lib/medusa-cart';
import { CartClient } from './CartClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Cart · Rollout Store',
    robots: { index: false },
};

export default async function CartPage() {
    const cart = await getCart();
    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <div className="container">
                <div className="eyebrow eyebrow-gold mb-4">／ CART</div>
                <h1 style={{ letterSpacing: 1, margin: '0 0 28px' }}>YOUR BAG</h1>
                <CartClient initialCart={cart} />
            </div>
        </section>
    );
}
