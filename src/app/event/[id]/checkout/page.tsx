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
 *
 * Glide (board G2 "Checkout" and "You're in"): page head with the way back to
 * the event, the hold as a notice, the shared checkout, and the confirmation
 * roundel. Every check, redirect and server action is unchanged.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, Clock, CreditCard } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { viewerCanViewEvent } from '@/lib/event-viewer';
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
import { GlideButton } from '@/components/glide/primitives';
import { PageHead } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Event checkout',
    robots: { index: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The event title and the refund line, as the page head's sub-line. */
function HeadSub({ title, policyLine }: { title: string | null; policyLine: string }) {
    return (
        <>
            {title ?? 'Event package'}. {policyLine}{' '}
            <Link href={REFUND_POLICY_PATH}>
                Full refund &amp; cancellation policy
                <ChevronRight size={14} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: '-2px' }} />
            </Link>
        </>
    );
}

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

    // Public events, and (088) private / followers-only events this viewer may
    // open, have a member checkout surface. viewerCanViewEvent falls back to
    // the legacy rule before _can_view_event is deployed.
    const admin = getSupabaseAdmin();
    const { data: ev } = await admin
        .from('events')
        .select('id, title, visibility, host_id, shop_id, time_zone, start_at, reservation_policy')
        .eq('id', id)
        .maybeSingle();
    if (!ev || !(await viewerCanViewEvent(ev as any))) notFound();

    const me = await getConsumerProfile();
    if (!me) {
        // Keep ?tier=&tickets= so a signed-out rider who tapped RESERVE N + PAY
        // lands back on the WHO'S GOING form for N riders after signing in.
        const keep = new URLSearchParams();
        if (tierParam && UUID_RE.test(tierParam)) keep.set("tier", tierParam);
        if (ticketsParam && /^\d+$/.test(ticketsParam)) keep.set("tickets", ticketsParam);
        const qs = keep.toString();
        redirect(`/login?next=${encodeURIComponent(`/event/${id}/checkout${qs ? `?${qs}` : ""}`)}&error=rsvp`);
    }

    const eventTitle: string | null = (ev as any).title ?? null;
    const back = { href: `/event/${id}`, label: 'Back to the event' };

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
            <div className="glide glide-page">
                <div className="g-wrap">
                    <section className="gt-done gt-narrow">
                        <ConfirmPoll
                            eventId={id}
                            initialState={snap.state}
                            initialSpotNo={snap.spotNo}
                            seats={orderSeats.length > 1 ? orderSeats : []}
                            eventTitle={eventTitle}
                        />
                        <div className="gt-done-acts">
                            <GlideButton href={`/event/${id}`}>Back to the event</GlideButton>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    // ── Checkout state — the event cart must belong to THIS event + member ──
    const eventCart = await getEventCart();
    const hasMatchingCart =
        !!eventCart &&
        eventCart.meta.eventId === id &&
        eventCart.meta.profileId === me.profileId &&
        eventCart.cart.items.length > 0;

    // "RESERVE N + PAY" always arrives with ?tier=&tickets=N and means a NEW
    // reservation: show the WHO'S GOING form (names + sweater sizes) even if
    // a cart from an earlier reservation is still remembered — otherwise the
    // member jumps straight to paying for that old cart and never picks sizes.
    // "COMPLETE PAYMENT" (no params) still goes to payment for the live hold.
    const wantsNewReservation = !!tierParam && UUID_RE.test(tierParam) && Number(ticketsParam ?? "0") > 0;
    if (!hasMatchingCart || wantsNewReservation) {
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
            // 086: remaining sweaters per size (null = no per-size limit, or the
            // RPC isn't deployed yet — the form then offers every size and
            // reserve_tickets stays the source of truth).
            let sizeAvailability: Record<string, number> | null = null;
            try {
                const { data: avail, error: availErr } = await admin.rpc('tier_size_availability', { p_tier: tierParam });
                if (!availErr && avail && typeof avail === 'object') sizeAvailability = avail as Record<string, number>;
            } catch {
                /* treat as unlimited */
            }
            const policyLine = refundPolicyShortLine(
                (ev as any).start_at,
                (ev as any).time_zone,
                (ev as any).reservation_policy,
            );
            return (
                <div className="glide glide-page">
                    <div className="g-wrap gt-page">
                        <PageHead back={back} title="Who's going" sub={<HeadSub title={eventTitle} policyLine={policyLine} />} />
                        <TicketAttendeesForm
                            eventId={id}
                            tierId={tierParam}
                            quantity={wantN}
                            priceCents={Number((tier as any).price_cents ?? 0)}
                            currency={(tier as any).currency ?? 'usd'}
                            tierName={(tier as any).name ?? null}
                            signedInName={me.displayName || ''}
                            signedInEmail={me.email || ''}
                            sizeAvailability={sizeAvailability}
                        />
                    </div>
                </div>
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
            <div className="glide glide-page">
                <div className="g-wrap gt-page">
                    <PageHead back={back} title="Checkout" />
                    <p className="g-note" role="status">
                        <CreditCard size={20} strokeWidth={2} aria-hidden="true" />
                        Checkout is temporarily unavailable: payments are not configured. Your spot is still held; please try again shortly.
                    </p>
                </div>
            </div>
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
        <div className="glide glide-page">
            <div className="g-wrap gt-page">
                <PageHead back={back} title="Checkout" sub={<HeadSub title={eventTitle} policyLine={policyLine} />} />
                <p className="g-note" role="status" style={{ marginBottom: 20 }}>
                    <Clock size={20} strokeWidth={2} aria-hidden="true" />
                    <span>
                        Your spot is held while you pay. Complete payment before the hold
                        expires{holdUntil ? <> at <span className="g-w">{holdUntil}</span></> : null} to lock it in.
                    </span>
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
                                <Link href={REFUND_POLICY_PATH} target="_blank">
                                    refund &amp; cancellation policy
                                </Link>
                                : no refunds within 72 hours of the start, tickets are non-transferable.
                            </>
                        ),
                    }}
                />
            </div>
        </div>
    );
}
