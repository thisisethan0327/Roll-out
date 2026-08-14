/**
 * /store/checkout — email + shipping + Stripe payment, then complete → order.
 *
 * Server component loads the cart and hands the browser-safe Stripe
 * publishable key to the client checkout. Empty carts bounce back to
 * /store/cart; a missing Stripe key renders an unavailable notice instead of
 * silently falling back to test mode.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCart } from '@/lib/medusa-cart';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CheckoutClient } from './CheckoutClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Checkout · Rollout Store',
    robots: { index: false },
};

export default async function CheckoutPage() {
    const cart = await getCart();
    if (!cart || cart.items.length === 0) redirect('/store/cart');

    // Refuse to render checkout without a Stripe key — the old hardcoded TEST
    // fallback would silently take fake payments if the env var went missing.
    if (!STRIPE_PUBLISHABLE_KEY) {
        return (
            <section className="section" style={{ padding: '40px 0 72px' }}>
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ CHECKOUT</div>
                    <h1 style={{ letterSpacing: 1, margin: '0 0 28px' }}>CHECKOUT</h1>
                    <p>
                        Checkout is temporarily unavailable — payments are not
                        configured. Please try again shortly.
                    </p>
                </div>
            </section>
        );
    }

    // A signed-in platform user gets their email prefilled and their order
    // linked to their Medusa customer (see completeCart). Anonymous shoppers
    // check out exactly as before.
    const supabase = await getSupabaseServer();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    const signedInEmail = user?.email ?? null;

    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <div className="container">
                <div className="eyebrow eyebrow-gold mb-4">／ CHECKOUT</div>
                <h1 style={{ letterSpacing: 1, margin: '0 0 28px' }}>CHECKOUT</h1>
                <CheckoutClient
                    initialCart={cart!}
                    stripeKey={STRIPE_PUBLISHABLE_KEY}
                    signedInEmail={signedInEmail}
                />
            </div>
        </section>
    );
}
