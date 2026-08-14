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
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    setRsvp,
    startPackageCheckout,
    type RsvpError,
    type RsvpState,
} from './actions';

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
};

type Props = {
    eventId: string;
    tiers: TierView[];
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
};

const ERROR_COPY: Record<RsvpError | 'config', string> = {
    auth: 'Sign in to RSVP.',
    full: 'This meet is at capacity.',
    closed: 'RSVPs are closed for this meet.',
    invalid: 'Something went wrong. Refresh and try again.',
    tier: 'That tier is not available. Refresh and try again.',
    write: "Couldn't save your RSVP. Try again.",
    config: "Couldn't start checkout — your spot is held, try again in a moment.",
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

export function TiersSection({
    eventId,
    tiers,
    isLoggedIn,
    initialState,
    initialTierId,
    initialSpotNo,
    initialWaitlistPosition,
    initialHoldExpiresAt,
    nextPath,
    inviteToken,
}: Props) {
    const router = useRouter();
    const [state, setState] = useState<RsvpState>(initialState);
    const [tierId, setTierId] = useState<string | null>(initialTierId);
    const [spotNo, setSpotNo] = useState<number | null>(initialSpotNo);
    const [waitPos, setWaitPos] = useState<number | null>(initialWaitlistPosition);
    const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(initialHoldExpiresAt);
    const [msg, setMsg] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    // 1s tick drives the hold countdown; starts server-safe (no Date.now in render path pre-mount).
    const [now, setNow] = useState<number>(() => new Date(initialHoldExpiresAt ?? 0).getTime());
    useEffect(() => {
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    if (!isLoggedIn) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <a className="btn btn-lg" href={`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`}>
                    Sign In to RSVP
                </a>
                <p
                    className="text-muted"
                    style={{ fontSize: 11, margin: 0, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)' }}
                >
                    PICK A TIER RIGHT HERE ON THE WEB · NO APP NEEDED
                </p>
            </div>
        );
    }

    const holdExpired = state === 'held' && holdExpiresAt != null && new Date(holdExpiresAt).getTime() - now <= 0;

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

    const choosePaid = (tier: TierView) => {
        if (pending) return;
        setMsg(null);
        startTransition(async () => {
            const res = await startPackageCheckout(eventId, tier.id);
            if (res.ok && 'redirect' in res) {
                router.push(res.redirect);
                return;
            }
            if (res.ok) {
                // Full event or full tier — the reservation queued instead.
                setState('waitlisted');
                setTierId(tier.id);
                setWaitPos(res.waitlistPosition);
                router.refresh();
                return;
            }
            if (res.error === 'auth') {
                router.push(`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`);
                return;
            }
            setMsg(ERROR_COPY[res.error]);
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

    const myTierName = tierId ? tiers.find((t) => t.id === tierId)?.name ?? null : null;

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
                            {holdExpiresAt ? formatRemaining(holdExpiresAt, now) : '—'}
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
                        CANCEL MY RSVP
                    </button>
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
            ) : null}

            {/* TIER CARDS — pick a tier (hidden once confirmed/held) */}
            {state !== 'confirmed' && (state !== 'held' || holdExpired) ? (
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
                                    gap: 10,
                                    padding: '18px 18px 16px',
                                    border: '1px solid var(--line-mid)',
                                    background: 'var(--bg-1)',
                                    textAlign: 'left',
                                    opacity: soldOut ? 0.65 : 1,
                                }}
                            >
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

                                <button
                                    type="button"
                                    disabled={pending || !buyable}
                                    onClick={() => (isFree ? chooseFree(tier) : choosePaid(tier))}
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
                                                : 'RESERVE + PAY ›'}
                                </button>
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
                        : state == null
                            ? 'PICK A TIER TO RSVP'
                            : ''}
            </p>
        </div>
    );
}
