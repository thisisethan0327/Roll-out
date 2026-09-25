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
import { TicketAttendeesForm } from './TicketAttendeesForm';
import { getRsvpSnapshot } from '../actions';
import { formatClock } from '@/lib/event-time';
import { refundPolicyShortLine, REFUND_POLICY_PATH } from '@/lib/refund-policy';
import { multiTicketsEnabled, MAX_TICKETS_PER_ORDER, myTicketsForEvent } from '@/lib/event-tickets';
import { isDeadTicketStatus } from '@/lib/event-tickets-shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Event checkout',
    robots: { index: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventCheckoutPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ done?: string; tier?: string; tickets?: string }>;
}) {
    const { id } = await params;
    const { done, tier: tierParam, tickets: ticketsParam } = await searchParams;
    if (!UUID_RE.test(id)) notFound();

    // Only public events have a member checkout surface.
    const admin = getSupabaseAdmin();
    const { data: ev } = await admin
        .from('events')
        .select('id, title, visibility, time_zone, start_at, reservation_policy')
        .eq('id', id)
        .maybeSingle();
    if (!ev || (ev as any).visibility !== 'public') notFound();

    const me = await getConsumerProfile();
    if (!me) redirect(`/login?next=${encodeURIComponent(`/event/${id}/checkout`)}&error=rsvp`);

    // ── Post-payment confirmation state ─────────────────────────────────────
    if (done) {
        const snap = await getRsvpSnapshot(id);
        // Multi-ticket order (feature-gated; [] when off): the buyer's own
        // seats that are live or still settling, for the success screen's
        // "N TICKETS" + seat list. One seat (or none) keeps the single copy.
        const orderSeats = (await myTicketsForEvent(id))
            .filter((t) => t.isBuyer && !isDeadTicketStatus(t.status))
            .sort((a, b) => a.seat - b.seat)
            .map((t) => ({ seat: t.seat, name: t.attendeeName, size: t.sweaterSize }));
        return (
            <section className="section" style={{ padding: '72px 0' }}>
                <div className="container container-narrow" style={{ textAlign: 'center' }}>
                    <div className="eyebrow eyebrow-gold mb-4" style={{ justifyContent: 'center' }}>
                        ／ SPOT SECURED
                    </div>
                    <ConfirmPoll
                        eventId={id}
                        initialState={snap.state}
                        initialSpotNo={snap.spotNo}
                        seats={orderSeats.length > 1 ? orderSeats : []}
                    />
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
    const hasMatchingCart =
        !!eventCart &&
        eventCart.meta.eventId === id &&
        eventCart.meta.profileId === me.profileId &&
        eventCart.cart.items.length > 0;

    if (!hasMatchingCart) {
        // Multi-ticket packages (feature-gated): the tier card navigates here
        // with ?tier=&tickets=N BEFORE any hold exists (reserve_tickets needs
        // attendee name/email/size per seat, which the tier card doesn't
        // collect) — render the WHO'S GOING form instead of bouncing back to
        // the event page. Any other case (disabled, no tier param, a stale/
        // mismatched cart with no tier param) keeps today's behaviour exactly:
        // redirect to the event page.
        const ticketsEnabled = await multiTicketsEnabled();
        const wantN = Math.max(1, Math.min(MAX_TICKETS_PER_ORDER, Number(ticketsParam ?? '0') || 0));
        if (ticketsEnabled && tierParam && UUID_RE.test(tierParam) && wantN > 0) {
            const { data: tier } = await admin
                .from('event_tiers')
                .select('id, event_id, name, price_cents, currency, active')
                .eq('id', tierParam)
                .maybeSingle();
            if (!tier || (tier as any).event_id !== id || !(tier as any).active) {
                redirect(`/event/${id}`);
            }
            const policyLine = refundPolicyShortLine(
                (ev as any).start_at,
                (ev as any).time_zone,
                (ev as any).reservation_policy,
            );
            return (
                <section className="section" style={{ padding: '40px 0 72px' }}>
                    <div className="container">
                        <div className="eyebrow eyebrow-gold mb-4">／ EVENT CHECKOUT</div>
                        <h1 style={{ letterSpacing: 1, margin: '0 0 10px' }}>
                            {((ev as any).title ?? 'EVENT PACKAGE').toUpperCase()}
                        </h1>
                        <p className="text-muted" style={{ fontSize: 12, margin: '0 0 28px', lineHeight: 1.6 }}>
                            {policyLine}{' '}
                            <Link href={REFUND_POLICY_PATH} className="text-link">
                                Full refund & cancellation policy ›
                            </Link>
                        </p>
                        <TicketAttendeesForm
                            eventId={id}
                            tierId={tierParam}
                            quantity={wantN}
                            priceCents={Number((tier as any).price_cents ?? 0)}
                            currency={(tier as any).currency ?? 'usd'}
                            signedInName={me.displayName || ''}
                            signedInEmail={me.email || ''}
                        />
                    </div>
                </section>
            );
        }
        redirect(`/event/${id}`);
    }
    // hasMatchingCart is true here, so eventCart is non-null — TS can't
    // follow that through the boolean alone, so it's re-asserted once here.
    const confirmedCart = eventCart!;

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

    // The hold's expiry is known to the page; it was never shown. A member
    // paying against a 15-minute clock they cannot see is the R12 complaint.
    const hold = await getRsvpSnapshot(id);
    const holdUntil = hold.state === 'held' && hold.holdExpiresAt ? formatClock(hold.holdExpiresAt, (ev as { time_zone?: string | null }).time_zone) : null;

    const policyLine = refundPolicyShortLine(
        (ev as any).start_at,
        (ev as any).time_zone,
        (ev as any).reservation_policy,
    );

    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <div className="container">
                <div className="eyebrow eyebrow-gold mb-4">／ EVENT CHECKOUT</div>
                <h1 style={{ letterSpacing: 1, margin: '0 0 10px' }}>
                    {((ev as any).title ?? 'EVENT PACKAGE').toUpperCase()}
                </h1>
                <p className="text-dim" style={{ fontSize: 13, margin: '0 0 12px' }}>
                    Your spot is held while you pay — complete payment before the hold
                    expires{holdUntil ? <> at <strong style={{ color: 'var(--text)' }}>{holdUntil}</strong></> : null} to
                    lock it in.
                </p>
                <p className="text-muted" style={{ fontSize: 12, margin: '0 0 28px', lineHeight: 1.6 }}>
                    {policyLine}{' '}
                    <Link href={REFUND_POLICY_PATH} className="text-link">
                        Full refund & cancellation policy ›
                    </Link>
                </p>
                <CheckoutClient
                    initialCart={confirmedCart.cart}
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
                    agreement={{
                        label: (
                            <>
                                I agree to the{' '}
                                <Link href={REFUND_POLICY_PATH} target="_blank" className="text-link" style={{ color: 'inherit', textDecoration: 'underline' }}>
                                    refund & cancellation policy
                                </Link>{' '}
                                — no refunds within 72 hours of the start, tickets are non-transferable.
                            </>
                        ),
                    }}
                />
            </div>
        </section>
    );
}
