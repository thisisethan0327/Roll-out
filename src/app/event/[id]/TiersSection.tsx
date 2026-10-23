'use client';
/**
 * Tier picker for tiered/paid events on /event/[id] (E2/E3).
 *
 * Replaces the flat Going/Maybe/Can't-Go strip ONLY when the event's rsvp_mode
 * is 'tiered' or 'paid' — free events keep RsvpControls untouched. A FREE tier
 * (price_cents = 0) is a one-tap RSVP through the same setRsvp/reserve_spot
 * path (with p_tier), while a paid tier goes through startPackageCheckout:
 * reserve_spot holds the spot (~15 min TTL) and the member is redirected into
 * the event-package checkout to pay.
 *
 * A live hold shows an MM:SS countdown to hold_expires_at (the D/H/M/S
 * Countdown.tsx is built for multi-day T-minus, not a 15-minute payment
 * window, so the compact timer lives here) plus COMPLETE PAYMENT + cancel.
 *
 * Glide (board G2 "Choose a ticket" / web event page): the tiers are a radio
 * group of cards; the picked tier shows its photo, what's included, the ticket
 * count and the slide-to-act control. The slide calls exactly what each tier's
 * own button called before (chooseFree / chooseTickets / choosePaid), with the
 * same arguments; nothing about the money path changed.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
import { Check, ChevronRight, Clock, Hourglass, Ticket, Undo2 } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { SlideToAct } from '@/components/glide/SlideToAct';
import { ErrorLine, Stepper } from '@/components/glide-tickets/parts';

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
    /** 087: plain-text "not included" note shown under the includes list. */
    notIncluded?: string | null;
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
    /** The viewer has a multi-ticket order with seats still live/pending for
     *  this event: MyTicketsPanel (rendered beside this) then owns the
     *  "you're in" state and the per-seat cancel, so the single-ticket
     *  confirmed block below is not rendered — one cancel path, not two.
     *  False (every single-ticket buyer) keeps that block exactly as before. */
    hasTicketOrder?: boolean;
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
    // 088: a private / followers-only event this member isn't invited to.
    invite_only: 'This event is invite-only.',
    suspended: 'Your account is suspended.',
};

function formatPrice(cents: number, currency: string): string {
    if (cents === 0) return 'Free';
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

const pad3 = (n: number) => String(n).padStart(3, '0');

/**
 * Tier package photo — a 4:3 image, with a strip of thumbnails when the
 * product has 2+ images. Plain <img> (not next/image): this page renders its
 * other remote images the same way and needs no next.config change. Keeps a
 * plain ground under the fading-in <img> until it has loaded.
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
        <div className="gt-media">
            <div className="gt-media-main">
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
                        style={{ opacity: loaded ? 1 : 0 }}
                    />
                ) : null}
            </div>

            {gallery.length > 1 ? (
                <div className="gt-media-thumbs">
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
    hasTicketOrder = false,
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

    // The tier the radio group has picked: the member's own tier if they have
    // one, otherwise the first tier that can be taken right now.
    const [picked, setPicked] = useState<string | null>(() => {
        if (initialTierId && tiers.some((t) => t.id === initialTierId)) return initialTierId;
        const open = tiers.find(
            (t) => (t.priceCents === 0 || t.purchasable) && !(t.remaining != null && t.remaining <= 0),
        );
        return (open ?? tiers[0])?.id ?? null;
    });

    // The slide control is remounted after each attempt so a refused or
    // failed write springs it back to the start (it holds its own drag state).
    const [slideKey, setSlideKey] = useState(0);
    const wasPending = useRef(false);
    useEffect(() => {
        if (wasPending.current && !pending) setSlideKey((k) => k + 1);
        wasPending.current = pending;
    }, [pending]);

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

    const showPicker = state !== 'confirmed' && state !== 'ticket_pending' && (state !== 'held' || holdExpired);
    const tier = tiers.find((t) => t.id === picked) ?? tiers[0] ?? null;

    // Arrow keys move the radio selection, as a native radio group would.
    const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const onRadioKey = (e: React.KeyboardEvent, i: number) => {
        const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(e.key) || tiers.length === 0) return;
        e.preventDefault();
        let next = i;
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tiers.length - 1;
        else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % tiers.length;
        else next = (i - 1 + tiers.length) % tiers.length;
        setPicked(tiers[next].id);
        radioRefs.current[next]?.focus();
    };

    const statusLine = msg
        ? null
        : holdExpired
            ? 'Your hold expired. Pick a tier to try again.'
            : !isLoggedIn
                ? 'Sign in or sign up to RSVP. No app needed.'
                : state == null && showPicker
                    ? tiers.length > 1
                        ? 'Pick a tier, then slide.'
                        : 'Slide, tap or press Enter.'
                    : null;

    return (
        <div className="gt-tiers">
            {/* MY STATUS — hold countdown / confirmed / waitlisted */}
            {state === 'held' && !holdExpired ? (
                <>
                    <div className="gt-state" role="status">
                        <span className="gt-state-n" aria-hidden="true">
                            <Hourglass size={22} strokeWidth={2} />
                        </span>
                        <span className="gt-state-t">
                            <b>
                                Spot held{spotNo != null ? <> · <span className="g-w">#{pad3(spotNo)}</span></> : null}
                            </b>
                            <small>
                                Complete payment in{' '}
                                <span className="g-w">{mounted && holdExpiresAt ? formatRemaining(holdExpiresAt, now) : '…'}</span>
                                {myTierName ? ` · ${myTierName}` : ''}
                            </small>
                        </span>
                    </div>
                    <GlideButton href={`/event/${eventId}/checkout`} block>
                        Complete payment
                    </GlideButton>
                    <div className="g-panel-acts">
                        <button type="button" className="g-link" onClick={cancel} disabled={pending}>
                            <Undo2 size={16} strokeWidth={2} aria-hidden="true" />
                            Cancel reservation
                        </button>
                    </div>
                </>
            ) : state === 'confirmed' && hasTicketOrder ? null : state === 'confirmed' ? (
                <>
                    <div className="gt-state" role="status">
                        <span className="gt-state-n" aria-hidden="true">
                            <Check size={24} strokeWidth={2.4} />
                        </span>
                        <span className="gt-state-t">
                            <b>
                                You&apos;re in{spotNo != null ? <> · spot <span className="g-w">#{pad3(spotNo)}</span></> : null}
                            </b>
                            {myTierName ? <small>{myTierName}</small> : null}
                        </span>
                    </div>
                    {myTierIsPaid ? (
                        <PaidCancelControl eventId={eventId} refundOpen={refundOpen} policyLine={policyLine} />
                    ) : (
                        <div className="g-panel-acts">
                            <button type="button" className="g-link" onClick={cancel} disabled={pending}>
                                <Undo2 size={16} strokeWidth={2} aria-hidden="true" />
                                Cancel my RSVP
                            </button>
                        </div>
                    )}
                </>
            ) : state === 'waitlisted' ? (
                <div className="gt-state" role="status">
                    <span className="gt-state-n" aria-hidden="true">
                        {waitPos != null ? `#${waitPos}` : <Clock size={22} strokeWidth={2} />}
                    </span>
                    <span className="gt-state-t">
                        <b>{waitPos != null ? <>You&apos;re #{waitPos} on the waitlist</> : <>You&apos;re on the waitlist</>}</b>
                        <small>
                            Spots are offered in order.
                            {myTierName ? ` ${myTierName}.` : ''}
                        </small>
                    </span>
                    <button type="button" className="gt-mini" onClick={cancel} disabled={pending} aria-label="Leave the waitlist">
                        Leave
                    </button>
                </div>
            ) : state === 'ticket_pending' ? (
                // Migration 080: the caller has a ticket on someone else's
                // still-unpaid multi-ticket order — nothing for THEM to pay
                // or reserve; they're just waiting on that buyer.
                <div className="gt-state gt-state--plain" role="status">
                    <span className="gt-state-n" aria-hidden="true">
                        <Clock size={22} strokeWidth={2} />
                    </span>
                    <span className="gt-state-t">
                        <b>Ticket pending{myTierName ? ` · ${myTierName}` : ''}</b>
                        <small>
                            You&apos;re on someone else&apos;s order for this meet. Your spot confirms once they finish paying.
                        </small>
                    </span>
                </div>
            ) : null}

            {/* TIERS — pick one (hidden once confirmed/held) */}
            {showPicker && tier ? (
                <>
                    <div className="gt-tks" role="radiogroup" aria-label="Tickets">
                        {tiers.map((t, i) => {
                            const soldOut = t.remaining != null && t.remaining <= 0;
                            const on = t.id === tier.id;
                            const sub = [
                                t.capacity != null ? (soldOut ? 'Tier full, joins the waitlist' : `${t.remaining} of ${t.capacity} left`) : null,
                                t.reservedSpot ? 'Reserved spot' : null,
                            ]
                                .filter(Boolean)
                                .join(' · ') || (t.includes[0] ?? null);
                            return (
                                <button
                                    key={t.id}
                                    ref={(el) => {
                                        radioRefs.current[i] = el;
                                    }}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    tabIndex={on ? 0 : -1}
                                    className={`gt-tk${soldOut ? ' is-out' : ''}`}
                                    onClick={() => setPicked(t.id)}
                                    onKeyDown={(e) => onRadioKey(e, i)}
                                >
                                    <span className="gt-tk-t">
                                        <b>{t.name}</b>
                                        {sub ? <small>{sub}</small> : null}
                                    </span>
                                    <span className="gt-tk-pr g-w">{formatPrice(t.priceCents, t.currency)}</span>
                                    <span className="gt-tk-rd" aria-hidden="true">
                                        <Check size={14} strokeWidth={3} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <PickedTier
                        key={tier.id}
                        tier={tier}
                        isLoggedIn={isLoggedIn}
                        ticketsEnabled={ticketsEnabled}
                        qty={qty[tier.id] ?? 1}
                        setQty={(n) => setQty((q) => ({ ...q, [tier.id]: n }))}
                        pending={pending}
                        slideKey={slideKey}
                        loginHref={loginHref}
                        signupHref={signupHref}
                        policyLine={policyLine}
                        onAct={() =>
                            tier.priceCents === 0
                                ? chooseFree(tier)
                                : ticketsEnabled
                                    ? chooseTickets(tier)
                                    : choosePaid(tier)
                        }
                    />
                </>
            ) : null}

            {msg ? <ErrorLine>{msg}</ErrorLine> : null}
            {statusLine ? (
                <p className="g-panel-status" role="status" aria-live="polite">
                    {statusLine}
                </p>
            ) : null}
        </div>
    );
}

/** The picked tier's details and its one action. */
function PickedTier({
    tier,
    isLoggedIn,
    ticketsEnabled,
    qty,
    setQty,
    pending,
    slideKey,
    loginHref,
    signupHref,
    policyLine,
    onAct,
}: {
    tier: TierView;
    isLoggedIn: boolean;
    ticketsEnabled: boolean;
    qty: number;
    setQty: (n: number) => void;
    pending: boolean;
    slideKey: number;
    loginHref: string;
    signupHref: string;
    policyLine: string;
    onAct: () => void;
}) {
    const soldOut = tier.remaining != null && tier.remaining <= 0;
    const isFree = tier.priceCents === 0;
    const buyable = isFree || tier.purchasable;
    const hasImage = !!(tier.image && (tier.image.images.length > 0 || tier.image.thumbnail));
    const showQty = isLoggedIn && ticketsEnabled && !isFree && buyable && !soldOut;
    const max = Math.max(1, Math.min(MAX_TICKETS, tier.remaining ?? MAX_TICKETS));
    const n = Math.max(1, Math.min(max, qty));
    const price = formatPrice(tier.priceCents, tier.currency);

    const label = soldOut
        ? 'Join the waitlist'
        : isFree
            ? 'Slide to RSVP'
            : ticketsEnabled && n > 1
                ? `Reserve ${n} + pay`
                : 'Reserve + pay';

    return (
        <div className="gt-pick">
            {hasImage ? <TierMedia image={tier.image} name={tier.name} /> : null}

            {tier.includes.length > 0 ? (
                <div className="gt-inc">
                    <h3>What&apos;s included</h3>
                    <ul>
                        {tier.includes.map((inc) => (
                            <li key={inc}>
                                <Check size={16} strokeWidth={2.2} aria-hidden="true" />
                                {inc}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {tier.notIncluded ? (
                <p className="gt-notinc">
                    <b>Not included:</b> {tier.notIncluded}
                </p>
            ) : null}

            {showQty ? (
                <div className="gt-qtyrow">
                    <Ticket size={22} strokeWidth={1.5} aria-hidden="true" />
                    <span className="gt-qtyrow-t">
                        <b>Tickets</b>
                        <small>{max > 1 ? `Up to ${max} per order` : 'One per order'}</small>
                    </span>
                    <Stepper value={n} max={max} onChange={(v) => setQty(Math.max(1, Math.min(max, v)))} label="tickets" disabled={pending} />
                </div>
            ) : null}

            {!isLoggedIn ? (
                <>
                    <GlideButton href={loginHref} plain block>
                        {isFree ? 'Sign in to RSVP' : 'Sign in to reserve'}
                    </GlideButton>
                    <div className="g-panel-acts">
                        <a className="g-link" href={signupHref}>
                            New to Rollout? Sign up
                            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                        </a>
                    </div>
                </>
            ) : !buyable ? (
                <button type="button" className="g-btn g-btn--block gt-btn-off" disabled>
                    <span>Unavailable</span>
                    <span className="g-btn-k" aria-hidden="true">
                        <Ticket size={20} strokeWidth={2} />
                    </span>
                </button>
            ) : (
                <SlideToAct
                    key={slideKey}
                    label={label}
                    sub={!isFree && !soldOut ? (n > 1 ? `${n} × ${price}` : price) : undefined}
                    ariaLabel={`${label}: ${tier.name}${isFree ? '' : `, ${price}${n > 1 ? ` each, ${n} tickets` : ''}`}`}
                    doneLabel={isFree ? "You're in" : 'Reserving'}
                    busy={pending}
                    onComplete={onAct}
                />
            )}

            {!isFree ? (
                <p className="gt-fine">
                    {policyLine}{' '}
                    <Link href={REFUND_POLICY_PATH}>
                        Full policy
                        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                    </Link>
                </p>
            ) : null}
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
            <p className="gt-fine">
                <b style={{ color: 'var(--ink)' }}>Non-refundable within 72 hours of the start.</b> {policyLine}{' '}
                <Link href={REFUND_POLICY_PATH}>
                    Full policy
                    <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                </Link>
            </p>
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
        <>
            {armed ? (
                <div className="g-panel-sub" role="group" aria-label="Confirm the refund">
                    <button type="button" className="g-sec" onClick={confirm} disabled={pending} aria-pressed="true">
                        {pending ? 'Refunding…' : 'Confirm: cancel & refund'}
                    </button>
                    <button type="button" className="g-sec g-sec--ink" onClick={() => setArmed(false)} disabled={pending}>
                        Keep my spot
                    </button>
                </div>
            ) : (
                <div className="g-panel-sub">
                    <button type="button" className="g-sec g-sec--ink" onClick={() => setArmed(true)} disabled={pending}>
                        <Undo2 size={18} strokeWidth={1.75} aria-hidden="true" />
                        Cancel &amp; get a full refund
                    </button>
                </div>
            )}
            <p className="gt-fine">
                Your spot is released immediately. {policyLine}{' '}
                <Link href={REFUND_POLICY_PATH}>
                    Full policy
                    <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                </Link>
            </p>
            {err ? <ErrorLine>{err}</ErrorLine> : null}
        </>
    );
}
