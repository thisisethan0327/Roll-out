'use client';
/**
 * Tier picker for tiered/paid events on /event/[id] (E2/E3).
 *
 * Replaces the flat Going/Maybe/Can't-Go strip ONLY when the event's rsvp_mode
 * is 'tiered' or 'paid' — free events keep RsvpControls untouched. Each active
 * tier renders as a card; a FREE tier (price_cents = 0) is a one-tap RSVP
 * through the same setRsvp/reserve_spot path (with p_tier), while a paid tier
 * goes through startPackageCheckout: reserve_spot holds the spot (~15 min TTL)
 * and the member is redirected into the event-package checkout to pay.
 *
 * A live hold shows an MM:SS countdown to hold_expires_at (the D/H/M/S
 * Countdown.tsx is built for multi-day T-minus, not a 15-minute payment
 * window, so the compact timer lives here) plus COMPLETE PAYMENT + cancel.
 *
 * Styling is inline to match the hand-rolled HUD look of the event page.
 */
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    setRsvp,
    startPackageCheckout,
    cancelPaidRsvp,
    type RsvpError,
    type RsvpState,
} from './actions';
import {
    refundPolicyShortLine,
    refundWindowOpen,
    REFUND_POLICY_PATH,
    type ReservationPolicy,
} from '@/lib/refund-policy';

export type TierView = {
    id: string;
    name: string;
    priceCents: number;
    currency: string;
    /** Tier sub-cap (null = shares the event cap). */
    capacity: number | null;
    /** Spots left within the sub-cap (null when capacity is null). */
    remaining: number | null;
    reservedSpot: boolean;
    includes: string[];
    packageMode: 'none' | 'included' | 'addon';
    packagePriceCents: number | null;
    /** True when the tier has a Medusa product to sell (paid tiers need one). */
    purchasable: boolean;
    /** Package photo(s) from the tier's Medusa product — null when there is
     * no product, or the (best-effort) fetch found/returned none. `images`
     * are the web-sized opt/*.webp display URLs; `imagesOriginal` are the
     * untouched originals, index-paired, for onError fallback if a twin
     * 404s. */
    image: {
        thumbnail: string | null;
        thumbnailOriginal: string | null;
        images: string[];
        imagesOriginal: string[];
    } | null;
};

type Props = {
    eventId: string;
    tiers: TierView[];
    /** Event start (UTC) + zone + refund-policy overrides — for the refund
     *  cutoff line on paid tiers and the Cancel & refund control (077). */
    eventStartAt: string | null;
    eventTimeZone: string | null;
    reservationPolicy: ReservationPolicy;
    isLoggedIn: boolean;
    initialState: RsvpState;
    initialTierId: string | null;
    initialSpotNo: number | null;
    initialWaitlistPosition: number | null;
    initialHoldExpiresAt: string | null;
    /** Full path (with query) to return to after sign-in. */
    nextPath: string;
    /** Per-invite token from ?invite= — stamps invite attribution on RSVP. */
    inviteToken?: string | null;
    /** Multi-ticket packages (feature-gated, see lib/event-tickets.ts). False
     *  keeps every paid-tier button on today's single-seat reserve_spot path
     *  — this prop is the ONLY thing that changes tier-card behaviour. */
    ticketsEnabled?: boolean;
};

const MAX_TICKETS = 5;

const ERROR_COPY: Record<RsvpError | 'config', string> = {
    auth: 'Sign in to RSVP.',
    full: 'This meet is at capacity.',
    closed: 'RSVPs are closed for this meet.',
    invalid: 'Something went wrong. Refresh and try again.',
    tier: 'That tier is not available. Refresh and try again.',
    write: "Couldn't save your RSVP. Try again.",
    config: "Couldn't start checkout — your spot is held, try again in a moment.",
    // The UI routes a paid confirmed spot to PaidCancelControl instead of
    // this plain cancel, so this should be unreachable — kept for the union.
    paid_spot: 'Paid spots are cancelled through the refund flow, not this button.',
};

function formatPrice(cents: number, currency: string): string {
    if (cents === 0) return 'FREE';
    const cur = currency.toUpperCase();
    return `${cur === 'USD' ? '$' : cur + ' '}${(cents / 100).toFixed(2)}`;
}

/** MM:SS remaining until an ISO deadline (00:00 once expired). */
function formatRemaining(deadline: string, now: number): string {
    const diff = new Date(deadline).getTime() - now;
    if (!Number.isFinite(diff) || diff <= 0) return '00:00';
    const m = Math.floor(diff / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Tier card package photo — a 4:3 image up top, with a small clickable
 * thumbnail strip when the product has 2+ images. Plain <img> (not
 * next/image): this page renders its other remote images as CSS
 * background-image, not through the optimizer, so a plain tag matches how
 * images already render here and needs no next.config change. Renders a
 * dark placeholder (no broken-image icon) when there's no photo yet, and
 * keeps showing it under the fading-in <img> until the image finishes
 * loading.
 *
 * Each src is the web-sized opt/*.webp twin; if that 404s (e.g. a
 * brand-new upload the batch optimiser hasn't reached yet) onError swaps
 * that one <img> to the untouched original, index-paired via `originals`.
 */
function TierMedia({ image, name }: { image: TierView['image']; name: string }) {
    const gallery =
        image?.images && image.images.length > 0
            ? image.images
            : image?.thumbnail
                ? [image.thumbnail]
                : [];
    const originals =
        image?.imagesOriginal && image.imagesOriginal.length > 0
            ? image.imagesOriginal
            : image?.thumbnailOriginal
                ? [image.thumbnailOriginal]
                : [];
    const [active, setActive] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const src = gallery[active] ?? null;
    const fallbackSrc = originals[active] ?? null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
                style={{
                    position: 'relative',
                    aspectRatio: '4 / 3',
                    background: 'var(--bg-2)',
                    borderBottom: '1px solid var(--line)',
                    overflow: 'hidden',
                }}
            >
                {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={src}
                        src={src}
                        alt={name}
                        loading="lazy"
                        // A cached image can finish loading before React
                        // attaches onLoad (the browser resolves it
                        // synchronously), which would leave opacity stuck at
                        // 0 forever. The ref callback runs right after mount
                        // and catches that already-complete case; onLoad
                        // still covers the normal not-yet-cached path.
                        ref={(el) => {
                            if (el?.complete) setLoaded(true);
                        }}
                        onLoad={() => setLoaded(true)}
                        onError={(e) => {
                            // opt/*.webp twin 404'd — fall back to the
                            // original once, never loop if that fails too.
                            const el = e.currentTarget;
                            if (fallbackSrc && el.src !== fallbackSrc) el.src = fallbackSrc;
                        }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            opacity: loaded ? 1 : 0,
                            transition: 'opacity 160ms ease',
                        }}
                    />
                ) : null}
            </div>

            {gallery.length > 1 ? (
                <div style={{ display: 'flex', gap: 6, padding: '0 10px 2px', flexWrap: 'wrap' }}>
                    {gallery.slice(0, 6).map((img, i) => {
                        const isActive = i === active;
                        const thumbFallback = originals[i] ?? null;
                        return (
                            <button
                                key={img}
                                type="button"
                                onClick={() => {
                                    setActive(i);
                                    setLoaded(false);
                                }}
                                aria-label={`View image ${i + 1} of ${gallery.length}`}
                                aria-pressed={isActive}
                                style={{
                                    position: 'relative',
                                    width: 36,
                                    height: 27,
                                    padding: 0,
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    background: 'var(--bg-2)',
                                    border: `1px solid ${isActive ? 'var(--gold)' : 'var(--line)'}`,
                                    opacity: isActive ? 1 : 0.72,
                                    transition: 'opacity 120ms ease, border-color 120ms ease',
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={img}
                                    alt=""
                                    loading="lazy"
                                    onError={(e) => {
                                        const el = e.currentTarget;
                                        if (thumbFallback && el.src !== thumbFallback) el.src = thumbFallback;
                                    }}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

export function TiersSection({
    eventId,
    tiers,
    eventStartAt,
    eventTimeZone,
    reservationPolicy,
    isLoggedIn,
    initialState,
    initialTierId,
    initialSpotNo,
    initialWaitlistPosition,
    initialHoldExpiresAt,
    nextPath,
    inviteToken,
    ticketsEnabled = false,
}: Props) {
    const router = useRouter();
    // Per-tier quantity stepper (multi-ticket packages only) — 1..min(5, spots left).
    const [qty, setQty] = useState<Record<string, number>>({});
    // Client-side estimate (TS fallback per lib/refund-policy.ts) — good
    // enough to decide which button to show; cancelPaidRsvp always re-checks
    // the live window server-side (preferring the RPC) before refunding.
    const refundOpen = useMemo(
        () => refundWindowOpen(eventStartAt, reservationPolicy),
        [eventStartAt, reservationPolicy],
    );
    const policyLine = useMemo(
        () => refundPolicyShortLine(eventStartAt, eventTimeZone, reservationPolicy),
        [eventStartAt, eventTimeZone, reservationPolicy],
    );
    const [state, setState] = useState<RsvpState>(initialState);
    const [tierId, setTierId] = useState<string | null>(initialTierId);
    const [spotNo, setSpotNo] = useState<number | null>(initialSpotNo);
    const [waitPos, setWaitPos] = useState<number | null>(initialWaitlistPosition);
    const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(initialHoldExpiresAt);
    const [msg, setMsg] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    // 1s tick drives the hold countdown; starts server-safe (no Date.now in render path pre-mount).
    // `mounted` gates EXPIRY, not the banner: pre-mount `now` equals the expiry
    // timestamp itself, which made `holdExpired` true during SSR and hid the
    // SPOT HELD banner on every page load while holding (caught by Part C).
    // Server + first client render agree (banner shown, countdown '…'), so
    // there is no hydration mismatch; the real clock takes over on mount.
    const [now, setNow] = useState<number>(() => new Date(initialHoldExpiresAt ?? 0).getTime());
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // Signed-out visitors see the same tier cards (photos, contents, price,
    // refund policy) so the full package is public; only the action differs:
    // sign in, or sign up, and come straight back here to pick the tier.
    const loginHref = `/login?next=${encodeURIComponent(nextPath)}&error=rsvp`;
    const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;

    const holdExpired =
        mounted && state === 'held' && holdExpiresAt != null && new Date(holdExpiresAt).getTime() - now <= 0;

    const chooseFree = (tier: TierView) => {
        if (pending) return;
        setMsg(null);
        startTransition(async () => {
            const res = await setRsvp(eventId, 'going', inviteToken ?? null, tier.id);
            if (res.ok) {
                setState(res.state);
                setTierId(tier.id);
                setSpotNo(res.spotNo ?? null);
                setWaitPos(res.waitlistPosition ?? null);
                setHoldExpiresAt(res.holdExpiresAt ?? null);
                router.refresh();
            } else if (res.error === 'auth') {
                router.push(`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`);
            } else {
                setMsg(ERROR_COPY[res.error]);
            }
        });
    };

    // Multi-ticket packages (feature-gated): quantity is chosen here, but the
    // hold itself needs attendee name/email/size per seat, which this card
    // doesn't collect — so this only navigates to checkout with the chosen
    // tier + quantity; the actual reserve_tickets hold is created when the
    // member submits the WHO'S GOING form there (see checkout/page.tsx).
    const chooseTickets = (tier: TierView) => {
        if (pending) return;
        const n = Math.max(1, Math.min(MAX_TICKETS, qty[tier.id] ?? 1));
        router.push(`/event/${eventId}/checkout?tier=${tier.id}&tickets=${n}`);
    };

    const choosePaid = (tier: TierView) => {
        if (pending) return;
        setMsg(null);
        startTransition(async () => {
            const res = await startPackageCheckout(eventId, tier.id);
            if (res.ok && 'redirect' in res) {
                router.push(res.redirect);
                return;
            }
            if (res.ok && res.state === 'waitlisted') {
                // Full event or full tier — the reservation queued instead.
                setState('waitlisted');
                setTierId(tier.id);
                setWaitPos(res.waitlistPosition);
                router.refresh();
                return;
            }
            if (res.ok && res.state === 'confirmed') {
                // Migration 080: reserve_spot claimed a ticket someone else
                // already bought for this member — they're in, no payment.
                setState('confirmed');
                setTierId(tier.id);
                setSpotNo(res.spotNo ?? null);
                router.refresh();
                return;
            }
            if (res.ok && res.state === 'ticket_pending') {
                // Migration 080: waiting on the buyer of that ticket to pay.
                setState('ticket_pending');
                setTierId(tier.id);
                router.refresh();
                return;
            }
            if (!res.ok) {
                if (res.error === 'auth') {
                    router.push(`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`);
                    return;
                }
                setMsg(ERROR_COPY[res.error]);
            }
        });
    };

    const cancel = () => {
        if (pending) return;
        setMsg(null);
        startTransition(async () => {
            const res = await setRsvp(eventId, null, inviteToken ?? null);
            if (res.ok) {
                setState(null);
                setTierId(null);
                setSpotNo(null);
                setWaitPos(null);
                setHoldExpiresAt(null);
                router.refresh();
            } else {
                setMsg(ERROR_COPY[res.error]);
            }
        });
    };

    const myTier = tierId ? tiers.find((t) => t.id === tierId) ?? null : null;
    const myTierName = myTier?.name ?? null;
    // Safe-by-default: an unmatched tier (e.g. retired after purchase) is
    // treated as paid so cancelling routes through the refund flow rather
    // than risking a silent free release of a spot that was paid for.
    const myTierIsPaid = tierId != null && (myTier == null || myTier.priceCents > 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
            {/* MY STATUS — hold countdown / confirmed / waitlisted banner */}
            {state === 'held' && !holdExpired ? (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                        padding: '16px 22px',
                        border: '1px solid var(--gold)',
                        background: 'var(--gold-dim)',
                    }}
                >
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 12,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--gold)',
                        }}
                    >
                        ● SPOT HELD{spotNo != null ? ` · #${String(spotNo).padStart(3, '0')}` : ''} — COMPLETE PAYMENT IN{' '}
                        <span style={{ color: 'var(--text)', fontWeight: 700 }}>
                            {mounted && holdExpiresAt ? formatRemaining(holdExpiresAt, now) : '…'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Link href={`/event/${eventId}/checkout`} className="btn btn-lg" style={{ textDecoration: 'none' }}>
                            COMPLETE PAYMENT ›
                        </Link>
                        <button
                            type="button"
                            onClick={cancel}
                            disabled={pending}
                            className="font-display"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-3)',
                                fontSize: 10,
                                letterSpacing: 'var(--track-wider)',
                                cursor: pending ? 'wait' : 'pointer',
                                textDecoration: 'underline',
                            }}
                        >
                            CANCEL RESERVATION
                        </button>
                    </div>
                </div>
            ) : state === 'confirmed' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 12,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--gold)',
                        }}
                    >
                        ✓ YOU&apos;RE IN{spotNo != null ? ` · SPOT #${String(spotNo).padStart(3, '0')}` : ''}
                        {myTierName ? ` · ${myTierName.toUpperCase()}` : ''}
                    </div>
                    {myTierIsPaid ? (
                        <PaidCancelControl eventId={eventId} refundOpen={refundOpen} policyLine={policyLine} />
                    ) : (
                        <button
                            type="button"
                            onClick={cancel}
                            disabled={pending}
                            className="font-display"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-3)',
                                fontSize: 10,
                                letterSpacing: 'var(--track-wider)',
                                cursor: pending ? 'wait' : 'pointer',
                                textDecoration: 'underline',
                                // This is the ONLY exit from a tiered RSVP and it
                                // was 119x13 — under half the 44px minimum. The
                                // text stays small; the target does not.
                                minHeight: 44,
                                padding: '0 16px',
                            }}
                        >
                            CANCEL MY RSVP
                        </button>
                    )}
                </div>
            ) : state === 'waitlisted' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 12,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--text-2)',
                        }}
                    >
                        ● WAITLISTED{waitPos != null ? ` · #${waitPos} IN LINE` : ''}
                        {myTierName ? ` · ${myTierName.toUpperCase()}` : ''}
                    </div>
                    <button
                        type="button"
                        onClick={cancel}
                        disabled={pending}
                        className="font-display"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-3)',
                            fontSize: 10,
                            letterSpacing: 'var(--track-wider)',
                            cursor: pending ? 'wait' : 'pointer',
                            textDecoration: 'underline',
                        }}
                    >
                        LEAVE WAITLIST
                    </button>
                </div>
            ) : state === 'ticket_pending' ? (
                // Migration 080: the caller has a ticket on someone else's
                // still-unpaid multi-ticket order — nothing for THEM to pay
                // or reserve; they're just waiting on that buyer.
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 12,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--text-2)',
                        }}
                    >
                        ● TICKET PENDING{myTierName ? ` · ${myTierName.toUpperCase()}` : ''}
                    </div>
                    <p className="text-muted" style={{ fontSize: 11, margin: 0, textAlign: 'center', maxWidth: 320 }}>
                        You&apos;re on someone else&apos;s order for this meet — your spot confirms once they finish paying.
                    </p>
                </div>
            ) : null}

            {/* TIER CARDS — pick a tier (hidden once confirmed/held) */}
            {state !== 'confirmed' && state !== 'ticket_pending' && (state !== 'held' || holdExpired) ? (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 320px))',
                        gap: 14,
                        justifyContent: 'center',
                        width: '100%',
                    }}
                >
                    {tiers.map((tier) => {
                        const soldOut = tier.remaining != null && tier.remaining <= 0;
                        const isFree = tier.priceCents === 0;
                        const buyable = isFree || tier.purchasable;
                        return (
                            <div
                                key={tier.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    border: '1px solid var(--line-mid)',
                                    background: 'var(--bg-1)',
                                    textAlign: 'left',
                                    opacity: soldOut ? 0.65 : 1,
                                    overflow: 'hidden',
                                }}
                            >
                                <TierMedia image={tier.image} name={tier.name} />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 18px 16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                                    <span
                                        style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: 13,
                                            fontWeight: 700,
                                            letterSpacing: 1,
                                            color: 'var(--text)',
                                        }}
                                    >
                                        {tier.name.toUpperCase()}
                                    </span>
                                    <span className="accent" style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>
                                        {formatPrice(tier.priceCents, tier.currency)}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {tier.reservedSpot ? (
                                        <span
                                            style={{
                                                padding: '3px 8px',
                                                border: '1px solid var(--gold)',
                                                color: 'var(--gold)',
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 9,
                                                letterSpacing: 'var(--track-wider)',
                                            }}
                                        >
                                            RESERVED SPOT
                                        </span>
                                    ) : null}
                                    {tier.includes.map((inc) => (
                                        <span
                                            key={inc}
                                            style={{
                                                padding: '3px 8px',
                                                border: '1px solid var(--line-mid)',
                                                color: 'var(--text-2)',
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 9,
                                                letterSpacing: 'var(--track-wider)',
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            {inc}
                                        </span>
                                    ))}
                                </div>

                                {tier.capacity != null ? (
                                    <div
                                        className="text-muted"
                                        style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 'var(--track-wider)' }}
                                    >
                                        {soldOut
                                            ? 'TIER FULL · JOINS WAITLIST'
                                            : `${tier.remaining} OF ${tier.capacity} LEFT`}
                                    </div>
                                ) : null}

                                {!isFree ? (
                                    <p
                                        className="text-muted"
                                        style={{ fontSize: 10, lineHeight: 1.5, margin: 0 }}
                                    >
                                        {policyLine}{' '}
                                        <Link href={REFUND_POLICY_PATH} className="text-link" style={{ color: 'inherit', textDecoration: 'underline' }}>
                                            Full policy ›
                                        </Link>
                                    </p>
                                ) : null}

                                {!isLoggedIn ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                                        <a
                                            href={loginHref}
                                            style={{
                                                padding: '12px 16px',
                                                border: '1px solid var(--gold)',
                                                background: isFree ? 'transparent' : 'var(--gold)',
                                                color: isFree ? 'var(--gold)' : 'var(--bg-0, #000)',
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                letterSpacing: 'var(--track-wider)',
                                                textAlign: 'center',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            {isFree ? 'SIGN IN TO RSVP ›' : 'SIGN IN TO RESERVE ›'}
                                        </a>
                                        <a
                                            href={signupHref}
                                            className="font-display"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minHeight: 44,
                                                color: 'var(--text-2)',
                                                fontSize: 10,
                                                letterSpacing: 'var(--track-wider)',
                                                textDecoration: 'underline',
                                            }}
                                        >
                                            NEW TO ROLLOUT? SIGN UP ›
                                        </a>
                                    </div>
                                ) : (
                                <>
                                {ticketsEnabled && !isFree && buyable && !soldOut ? (() => {
                                    const max = Math.max(1, Math.min(MAX_TICKETS, tier.remaining ?? MAX_TICKETS));
                                    const n = Math.max(1, Math.min(max, qty[tier.id] ?? 1));
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                                            <span className="font-display" style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: 'var(--text-2)' }}>
                                                TICKETS
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <button
                                                    type="button"
                                                    aria-label="Fewer tickets"
                                                    disabled={n <= 1}
                                                    onClick={() => setQty((q) => ({ ...q, [tier.id]: Math.max(1, n - 1) }))}
                                                    style={{ width: 28, height: 28, border: '1px solid var(--line-mid)', background: 'transparent', color: 'var(--text)', cursor: n <= 1 ? 'not-allowed' : 'pointer', opacity: n <= 1 ? 0.4 : 1 }}
                                                >
                                                    −
                                                </button>
                                                <span style={{ minWidth: 18, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>
                                                    {n}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label="More tickets"
                                                    disabled={n >= max}
                                                    onClick={() => setQty((q) => ({ ...q, [tier.id]: Math.min(max, n + 1) }))}
                                                    style={{ width: 28, height: 28, border: '1px solid var(--line-mid)', background: 'transparent', color: 'var(--text)', cursor: n >= max ? 'not-allowed' : 'pointer', opacity: n >= max ? 0.4 : 1 }}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })() : null}
                                <button
                                    type="button"
                                    disabled={pending || !buyable}
                                    onClick={() =>
                                        isFree
                                            ? chooseFree(tier)
                                            : ticketsEnabled
                                                ? chooseTickets(tier)
                                                : choosePaid(tier)
                                    }
                                    style={{
                                        marginTop: 4,
                                        padding: '12px 16px',
                                        border: '1px solid var(--gold)',
                                        background: isFree ? 'transparent' : 'var(--gold)',
                                        color: isFree ? 'var(--gold)' : 'var(--bg-0, #000)',
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        letterSpacing: 'var(--track-wider)',
                                        cursor: pending || !buyable ? 'not-allowed' : 'pointer',
                                        opacity: pending || !buyable ? 0.6 : 1,
                                        transition: 'background 120ms, color 120ms',
                                    }}
                                >
                                    {!buyable
                                        ? 'UNAVAILABLE'
                                        : soldOut
                                            ? 'JOIN WAITLIST'
                                            : isFree
                                                ? 'RSVP FREE'
                                                : ticketsEnabled && (qty[tier.id] ?? 1) > 1
                                                    ? `RESERVE ${Math.max(1, Math.min(MAX_TICKETS, tier.remaining ?? MAX_TICKETS, qty[tier.id] ?? 1))} + PAY ›`
                                                    : 'RESERVE + PAY ›'}
                                </button>
                                </>
                                )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            <p
                className="text-muted"
                style={{
                    fontSize: 11,
                    margin: 0,
                    minHeight: 14,
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 'var(--track-wider)',
                    color: msg ? 'var(--gold)' : 'var(--text-3)',
                }}
            >
                {msg
                    ? msg.toUpperCase()
                    : holdExpired
                        ? 'YOUR HOLD EXPIRED — PICK A TIER TO TRY AGAIN'
                        : !isLoggedIn
                            ? 'SIGN IN OR SIGN UP TO RSVP · NO APP NEEDED'
                            : state == null
                                ? 'PICK A TIER TO RSVP'
                                : ''}
            </p>
        </div>
    );
}

/**
 * "Cancel & get a full refund" for a confirmed PAID spot (077) — replaces the
 * plain "CANCEL MY RSVP" toggle, which must never silently release a paid
 * spot (cancel_rsvp itself now refuses that with a P0001 'paid_spot' error).
 * Two-click "armed" confirmation rather than window.confirm(), matching the
 * pattern the rest of the console uses for money-moving actions.
 */
function PaidCancelControl({
    eventId,
    refundOpen,
    policyLine,
}: {
    eventId: string;
    refundOpen: boolean;
    policyLine: string;
}) {
    const router = useRouter();
    const [armed, setArmed] = useState(false);
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    if (!refundOpen) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span
                    className="font-display"
                    style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: 'var(--text-3)' }}
                >
                    NON-REFUNDABLE WITHIN 72 HOURS OF THE START
                </span>
                <p className="text-muted" style={{ fontSize: 10, margin: 0, textAlign: 'center', maxWidth: 320 }}>
                    {policyLine}{' '}
                    <Link href={REFUND_POLICY_PATH} className="text-link" style={{ color: 'inherit', textDecoration: 'underline' }}>
                        Full policy ›
                    </Link>
                </p>
            </div>
        );
    }

    const confirm = () => {
        setErr(null);
        startTransition(async () => {
            const res = await cancelPaidRsvp(eventId);
            setArmed(false);
            if (res.ok) {
                router.refresh();
            } else {
                setErr(res.error);
            }
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {armed ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={pending}
                        className="font-display"
                        style={{
                            padding: '10px 16px',
                            border: '1px solid var(--warn, #ff6b6b)',
                            background: 'transparent',
                            color: 'var(--warn, #ff6b6b)',
                            fontSize: 10,
                            letterSpacing: 'var(--track-wider)',
                            cursor: pending ? 'wait' : 'pointer',
                        }}
                    >
                        {pending ? 'REFUNDING…' : 'CONFIRM — CANCEL & REFUND'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setArmed(false)}
                        disabled={pending}
                        className="font-display"
                        style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10, letterSpacing: 'var(--track-wider)', cursor: pending ? 'wait' : 'pointer', textDecoration: 'underline' }}
                    >
                        KEEP MY SPOT
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setArmed(true)}
                    disabled={pending}
                    className="font-display"
                    style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10, letterSpacing: 'var(--track-wider)', cursor: 'pointer', textDecoration: 'underline', minHeight: 44, padding: '0 16px' }}
                >
                    CANCEL & GET A FULL REFUND
                </button>
            )}
            <p className="text-muted" style={{ fontSize: 10, margin: 0, textAlign: 'center', maxWidth: 320 }}>
                Your spot is released immediately. {policyLine}{' '}
                <Link href={REFUND_POLICY_PATH} className="text-link" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    Full policy ›
                </Link>
            </p>
            {err ? (
                <span style={{ color: 'var(--warn, #ff6b6b)', fontSize: 11 }}>{err}</span>
            ) : null}
        </div>
    );
}
