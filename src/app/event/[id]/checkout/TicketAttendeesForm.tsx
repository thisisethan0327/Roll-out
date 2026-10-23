'use client';
/**
 * "WHO'S GOING" — multi-ticket packages (feature-gated), rendered on
 * /event/[id]/checkout BEFORE the address/payment step (CheckoutClient)
 * whenever there is no reserved ticket hold yet. Seat 1 is the signed-in
 * member (name + email read-only, matching how a buyer can't type someone
 * else's identity into their own seat) with just a size picker; seats 2..N
 * collect name, email, size.
 *
 * On submit this calls reserveEventTicketsAction (event/[id]/actions.ts),
 * which reserves the hold via reserve_tickets AND wires up the event cart in
 * one round trip — then the page reloads into the normal CheckoutClient flow
 * with the ticket line already in the cart.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reserveEventTicketsAction } from '../actions';
import { SWEATER_SIZES, type SweaterSize } from '@/lib/event-tickets-shared';
import { ArrowRight, Lock, LoaderCircle } from 'lucide-react';
import { ErrorLine } from '@/components/glide-tickets/parts';

type SeatDraft = { name: string; email: string; size: SweaterSize | '' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TicketAttendeesForm({
    eventId,
    tierId,
    quantity,
    priceCents,
    currency,
    tierName = null,
    signedInName,
    signedInEmail,
    sizeAvailability = null,
}: {
    eventId: string;
    tierId: string;
    quantity: number;
    priceCents: number;
    currency: string;
    /** The tier's name, shown above the total. */
    tierName?: string | null;
    signedInName: string;
    signedInEmail: string;
    /** Remaining sweaters per size (086 tier_size_availability); null = unlimited. */
    sizeAvailability?: Record<string, number> | null;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [seats, setSeats] = useState<SeatDraft[]>(() => [
        { name: signedInName, email: signedInEmail, size: '' },
        ...Array.from({ length: Math.max(0, quantity - 1) }, () => ({ name: '', email: '', size: '' as const })),
    ]);

    const priceLabel = useMemo(() => {
        const cur = currency.toUpperCase();
        const amount = ((priceCents * quantity) / 100).toFixed(2);
        return `${quantity} × ${cur === 'USD' ? '$' : cur + ' '}${(priceCents / 100).toFixed(2)} = ${cur === 'USD' ? '$' : cur + ' '}${amount} + tax`;
    }, [priceCents, quantity, currency]);

    function updateSeat(i: number, patch: Partial<SeatDraft>) {
        setSeats((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    }

    function validate(): string | null {
        const seenEmails = new Set<string>();
        for (let i = 0; i < seats.length; i++) {
            const s = seats[i];
            const label = i === 0 ? 'Your' : `Attendee ${i + 1}'s`;
            if (!s.name.trim()) return `${label} name is required.`;
            if (!EMAIL_RE.test(s.email.trim())) return `${label} email doesn't look right.`;
            if (!s.size) return `${label} sweater size is required.`;
            const key = s.email.trim().toLowerCase();
            if (seenEmails.has(key)) return 'Each attendee needs a different email.';
            seenEmails.add(key);
        }
        return null;
    }

    function submit() {
        if (pending) return;
        const problem = validate();
        if (problem) {
            setErr(problem);
            return;
        }
        setErr(null);
        startTransition(async () => {
            const res = await reserveEventTicketsAction(
                eventId,
                tierId,
                seats.map((s) => ({ name: s.name.trim(), email: s.email.trim().toLowerCase(), size: s.size as SweaterSize })),
            );
            if (res.ok) {
                router.replace(res.redirect);
                router.refresh();
                return;
            }
            setErr(res.error);
        });
    }

    return (
        <div className="gt-cols">
            <div className="gt-stack">
                <p className="gt-fine" style={{ fontSize: 15, padding: '0 4px' }}>
                    Every rider gets their own ticket. Add their name, email and sweater size; we&apos;ll email them once
                    payment goes through.
                </p>

                {seats.map((seat, i) => (
                    <section key={i} className="g-card gt-step is-active" aria-labelledby={`seat-${i}`}>
                        <div className="gt-step-h">
                            <span className="gt-seat-n" aria-hidden="true">
                                {i + 1}
                            </span>
                            <h2 id={`seat-${i}`}>{i === 0 ? 'Seat 1 · You (buyer)' : `Seat ${i + 1}`}</h2>
                        </div>
                        <div className="gt-step-body">
                            <div className="gt-fields">
                                <div className="gt-fsp">
                                    <label className="gt-fld">
                                        <span>Name</span>
                                        <input
                                            type="text"
                                            value={seat.name}
                                            readOnly={i === 0}
                                            disabled={pending}
                                            onChange={(e) => updateSeat(i, { name: e.target.value })}
                                            placeholder="Full name"
                                            autoComplete={i === 0 ? 'name' : 'off'}
                                        />
                                    </label>
                                    <label className="gt-fld">
                                        <span>Email</span>
                                        <input
                                            type="email"
                                            value={seat.email}
                                            readOnly={i === 0}
                                            disabled={pending}
                                            onChange={(e) => updateSeat(i, { email: e.target.value })}
                                            placeholder="name@example.com"
                                            autoComplete={i === 0 ? 'email' : 'off'}
                                        />
                                    </label>
                                </div>
                                <label className="gt-fld">
                                    <span>Sweater size</span>
                                    <select
                                        value={seat.size}
                                        disabled={pending}
                                        onChange={(e) => updateSeat(i, { size: e.target.value as SweaterSize })}
                                    >
                                        <option value="">Select…</option>
                                        {SWEATER_SIZES.map((sz) => {
                                            // Sizes already picked on OTHER seats in this order count too.
                                            const left = sizeAvailability ? (sizeAvailability[sz] ?? 0) : null;
                                            const takenHere = seats.filter((o, j) => j !== i && o.size === sz).length;
                                            const out = left != null && left - takenHere <= 0;
                                            return (
                                                <option key={sz} value={sz} disabled={out && seat.size !== sz}>
                                                    {out ? `${sz} — sold out` : sz}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </section>
                ))}
            </div>

            <aside className="g-card gt-sumcard gt-side" aria-labelledby="att-total">
                <h2 className="g-card-h" id="att-total">
                    Your tickets
                </h2>
                {tierName ? <p className="gt-card-sub">{tierName}</p> : null}
                <ul className="gt-sum">
                    <li className="is-all">
                        <span>Total</span>
                        <span className="g-w">{priceLabel}</span>
                    </li>
                </ul>
                <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {err ? <ErrorLine>{err}</ErrorLine> : null}
                    <button
                        type="button"
                        onClick={submit}
                        disabled={pending}
                        className="g-btn g-btn--block"
                        aria-busy={pending || undefined}
                    >
                        <span>{pending ? 'Reserving…' : `Reserve ${quantity} + continue`}</span>
                        <span className="g-btn-k" aria-hidden="true">
                            {pending ? <LoaderCircle size={20} strokeWidth={2} className="g-spin" /> : <ArrowRight size={20} strokeWidth={2} />}
                        </span>
                    </button>
                    <p className="gt-lockline">
                        <Lock size={15} strokeWidth={1.75} aria-hidden="true" />
                        Your spots are held while you pay.
                    </p>
                </div>
            </aside>
        </div>
    );
}
