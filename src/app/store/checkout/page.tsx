/**
 * /store/checkout — email + shipping + Stripe payment, then complete → order.
 *
 * Server component loads the cart and hands the browser-safe Stripe
 * publishable key to the client checkout. Empty carts bounce back to
 * /store/cart; a missing Stripe key renders an unavailable notice instead of
 * silently falling back to test mode.
 */
import type { Metadata } from 'next';
import { loadDefaultShippingAddress } from '@/lib/medusa-address';
import { redirect } from 'next/navigation';
import { getCart } from '@/lib/medusa-cart';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CheckoutClient } from './CheckoutClient';
import { CreditCard } from 'lucide-react';
import { PageHead } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Checkout · Store',
    robots: { index: false },
};

export default async function CheckoutPage() {
    const cart = await getCart();
    if (!cart || cart.items.length === 0) redirect('/store/cart');

    // Refuse to render checkout without a Stripe key — the old hardcoded TEST
    // fallback would silently take fake payments if the env var went missing.
    if (!STRIPE_PUBLISHABLE_KEY) {
        return (
            <div className="glide glide-page">
                <div className="g-wrap gt-page">
                    <PageHead back={{ href: '/store/cart', label: 'Cart' }} title="Checkout" />
                    <p className="g-note" role="status">
                        <CreditCard size={20} strokeWidth={2} aria-hidden="true" />
                        Checkout is temporarily unavailable: payments are not configured. Please try again shortly.
                    </p>
                </div>
            </div>
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
    // A saved default shipping address (onboarding, or a past checkout) prefills
    // the address step when this cart has none yet.
    const savedAddress = user && !cart!.shippingAddress?.address1 ? await loadDefaultShippingAddress() : null;

    return (
        <div className="glide glide-page">
            <div className="g-wrap gt-page">
                <PageHead back={{ href: '/store/cart', label: 'Cart' }} title="Checkout" />
                <CheckoutClient
                    initialCart={cart!}
                    stripeKey={STRIPE_PUBLISHABLE_KEY}
                    signedInEmail={signedInEmail}
                    initialAddress={savedAddress}
                />
            </div>
        </div>
    );
}
