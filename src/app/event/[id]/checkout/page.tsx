/**
 * /event/[id]/checkout — pay for a reserved (held) event-package tier (E3).
 *
 * Server component: verifies the member's event cart actually belongs to THIS
 * event (the cart metadata is the contract Medusa's completion gate checks)
 * and reuses the store CheckoutClient with the event-cart server actions, so
 * address → shipping → Stripe runs against the walled Events sales channel.
 * On success the client lands back here with ?done=<orderId> and the
 * confirmation polls the RSVP until the order.placed subscriber flips the held
 * spot to confirmed ("You're in — No. NNN").
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getConsumerProfile } from '@/lib/consumer';
import {
    getEventCart,
    setEventCheckoutContact,
    listEventShippingOptions,
    setEventShippingMethod,
    initEventStripePaymentSession,
    completeEventCart,
} from '@/lib/event-cart';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { CheckoutClient } from '../../../store/checkout/CheckoutClient';
import { ConfirmPoll } from './ConfirmPoll';
import { getRsvpSnapshot } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Event checkout · Rollout',
    robots: { index: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventCheckoutPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ done?: string }>;
}) {
    const { id } = await params;
    const { done } = await searchParams;
    if (!UUID_RE.test(id)) notFound();

    // Only public events have a member checkout surface.
    const admin = getSupabaseAdmin();
    const { data: ev } = await admin
        .from('events')
        .select('id, title, visibility')
        .eq('id', id)
        .maybeSingle();
    if (!ev || (ev as any).visibility !== 'public') notFound();

    const me = await getConsumerProfile();
    if (!me) redirect(`/login?next=${encodeURIComponent(`/event/${id}/checkout`)}&error=rsvp`);

    // ── Post-payment confirmation state ─────────────────────────────────────
    if (done) {
        const snap = await getRsvpSnapshot(id);
        return (
            <section className="section" style={{ padding: '72px 0' }}>
                <div className="container container-narrow" style={{ textAlign: 'center' }}>
                    <div className="eyebrow eyebrow-gold mb-4" style={{ justifyContent: 'center' }}>
                        ／ SPOT SECURED
                    </div>
                    <ConfirmPoll eventId={id} initialState={snap.state} initialSpotNo={snap.spotNo} />
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32 }}>
                        <Link href={`/event/${id}`} className="btn btn-lg">
                            BACK TO EVENT
                        </Link>
                    </div>
                </div>
            </section>
        );
    }

    // ── Checkout state — the event cart must belong to THIS event + member ──
    const eventCart = await getEventCart();
    if (
        !eventCart ||
        eventCart.meta.eventId !== id ||
        eventCart.meta.profileId !== me.profileId ||
        eventCart.cart.items.length === 0
    ) {
        redirect(`/event/${id}`);
    }

    // Refuse to render checkout without a Stripe key — same loud guard as the
    // store lane (never silently fall back to test mode).
    if (!STRIPE_PUBLISHABLE_KEY) {
        return (
            <section className="section" style={{ padding: '40px 0 72px' }}>
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ EVENT CHECKOUT</div>
                    <h1 style={{ letterSpacing: 1, margin: '0 0 28px' }}>CHECKOUT</h1>
                    <p>
                        Checkout is temporarily unavailable — payments are not
                        configured. Your spot is still held; please try again shortly.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <div className="container">
                <div className="eyebrow eyebrow-gold mb-4">／ EVENT CHECKOUT</div>
                <h1 style={{ letterSpacing: 1, margin: '0 0 10px' }}>
                    {((ev as any).title ?? 'EVENT PACKAGE').toUpperCase()}
                </h1>
                <p className="text-dim" style={{ fontSize: 13, margin: '0 0 28px' }}>
                    Your spot is held while you pay — complete payment before the hold
                    expires to lock it in.
                </p>
                <CheckoutClient
                    initialCart={eventCart.cart}
                    stripeKey={STRIPE_PUBLISHABLE_KEY}
                    signedInEmail={me.email}
                    actions={{
                        setCheckoutContact: setEventCheckoutContact,
                        listShippingOptions: listEventShippingOptions,
                        setShippingMethod: setEventShippingMethod,
                        initStripePaymentSession: initEventStripePaymentSession,
                        completeCart: completeEventCart,
                    }}
                    successPathPrefix={`/event/${id}/checkout?done=`}
                />
            </div>
        </section>
    );
}
