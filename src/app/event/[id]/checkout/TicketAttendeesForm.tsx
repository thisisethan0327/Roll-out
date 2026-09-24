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
import { SWEATER_SIZES, type SweaterSize } from '@/lib/event-tickets';

type SeatDraft = { name: string; email: string; size: SweaterSize | '' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TicketAttendeesForm({
    eventId,
    tierId,
    quantity,
    priceCents,
    currency,
    signedInName,
    signedInEmail,
}: {
    eventId: string;
    tierId: string;
    quantity: number;
    priceCents: number;
    currency: string;
    signedInName: string;
    signedInEmail: string;
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
            <div>
                <div className="eyebrow eyebrow-gold mb-4">／ WHO&apos;S GOING</div>
                <p className="text-dim" style={{ fontSize: 13, margin: 0 }}>
                    Every rider gets their own ticket. Add their name, email, and sweater size — we&apos;ll email them once payment goes through.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {seats.map((seat, i) => (
                    <div
                        key={i}
                        style={{
                            border: '1px solid var(--line)',
                            background: 'var(--bg-1)',
                            padding: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                        }}
                    >
                        <div
                            className="font-display"
                            style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: 'var(--gold)' }}
                        >
                            {i === 0 ? 'SEAT 1 · YOU (BUYER)' : `SEAT ${i + 1}`}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span className="text-dim" style={{ fontSize: 10, letterSpacing: 'var(--track-wider)' }}>NAME</span>
                                <input
                                    type="text"
                                    value={seat.name}
                                    readOnly={i === 0}
                                    disabled={pending}
                                    onChange={(e) => updateSeat(i, { name: e.target.value })}
                                    placeholder="Full name"
                                    style={inputStyle(i === 0)}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span className="text-dim" style={{ fontSize: 10, letterSpacing: 'var(--track-wider)' }}>EMAIL</span>
                                <input
                                    type="email"
                                    value={seat.email}
                                    readOnly={i === 0}
                                    disabled={pending}
                                    onChange={(e) => updateSeat(i, { email: e.target.value })}
                                    placeholder="name@example.com"
                                    style={inputStyle(i === 0)}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span className="text-dim" style={{ fontSize: 10, letterSpacing: 'var(--track-wider)' }}>SWEATER SIZE</span>
                                <select
                                    value={seat.size}
                                    disabled={pending}
                                    onChange={(e) => updateSeat(i, { size: e.target.value as SweaterSize })}
                                    style={inputStyle(false)}
                                >
                                    <option value="">Select…</option>
                                    {SWEATER_SIZES.map((sz) => (
                                        <option key={sz} value={sz}>{sz}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--line-mid)', paddingTop: 12 }}>
                <span className="font-display" style={{ fontSize: 11, letterSpacing: 'var(--track-wider)', color: 'var(--text-2)' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 15, color: 'var(--gold)' }}>{priceLabel}</span>
            </div>

            {err ? (
                <p style={{ color: 'var(--warn, #ff6b6b)', fontSize: 12, margin: 0 }}>{err}</p>
            ) : null}

            <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="btn btn-lg"
                style={{ alignSelf: 'flex-start', cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.7 : 1 }}
            >
                {pending ? 'RESERVING…' : `RESERVE ${quantity} + CONTINUE ›`}
            </button>
        </div>
    );
}

function inputStyle(readOnly: boolean): React.CSSProperties {
    return {
        padding: '10px 12px',
        border: '1px solid var(--line-mid)',
        background: readOnly ? 'var(--bg-2)' : 'var(--bg-0, #000)',
        color: readOnly ? 'var(--text-2)' : 'var(--text)',
        fontSize: 13,
        fontFamily: 'inherit',
    };
}
