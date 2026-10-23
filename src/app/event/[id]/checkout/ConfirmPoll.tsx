'use client';
/**
 * Post-payment confirmation for the event-package checkout (E3).
 *
 * The payment already succeeded and the order is placed — but the RSVP flip
 * (held → confirmed) happens asynchronously in Medusa's order.placed
 * subscriber. So this polls the member's RSVP briefly until the flip lands and
 * then shows the numbered spot. If the flip hasn't landed after the polling
 * window, the spot is still theirs — we say so instead of spinning forever.
 *
 * Glide (board G2 "You're in"): the check roundel with tricolore rings, the
 * spot number in Michroma, and the seats as a list.
 */
import { useEffect, useRef, useState } from 'react';
import { getRsvpSnapshot, type RsvpState } from '../actions';
import { OkRoundel } from '@/components/glide-tickets/parts';

const POLL_MS = 2000;
const MAX_POLLS = 15; // ~30s window — the subscriber usually lands in seconds.

export function ConfirmPoll({
    eventId,
    initialState,
    initialSpotNo,
    seats = [],
    eventTitle = null,
}: {
    eventId: string;
    initialState: RsvpState;
    initialSpotNo: number | null;
    /** Multi-ticket order: the buyer's seats (2+). Empty = single-ticket copy. */
    seats?: { seat: number; name: string; size: string | null }[];
    /** The event's title, for the line under the heading. */
    eventTitle?: string | null;
}) {
    const [state, setState] = useState<RsvpState>(initialState);
    const [spotNo, setSpotNo] = useState<number | null>(initialSpotNo);
    const [timedOut, setTimedOut] = useState(false);
    const polls = useRef(0);

    useEffect(() => {
        if (state === 'confirmed') return;
        const t = setInterval(async () => {
            polls.current += 1;
            if (polls.current > MAX_POLLS) {
                clearInterval(t);
                setTimedOut(true);
                return;
            }
            const snap = await getRsvpSnapshot(eventId);
            if (snap.state === 'confirmed') {
                setState('confirmed');
                setSpotNo(snap.spotNo);
                clearInterval(t);
            }
        }, POLL_MS);
        return () => clearInterval(t);
    }, [eventId, state]);

    if (state === 'confirmed' && seats.length > 1) {
        return (
            <>
                <OkRoundel />
                <h1>
                    You&apos;re in · <span className="g-w">{seats.length}</span> tickets
                </h1>
                <p>
                    {eventTitle ? `${eventTitle}. ` : ''}Payment received, every seat is locked in. Each attendee gets their
                    ticket by email now that payment has gone through.
                </p>
                <div className="gt-seats" style={{ marginTop: 24, textAlign: 'left' }}>
                    {seats.map((s) => (
                        <div key={s.seat} className="gt-seat">
                            <span className="gt-seat-n" aria-hidden="true">
                                {s.seat}
                            </span>
                            <span className="gt-seat-t">
                                <b>
                                    <span className="g-sr">Seat {s.seat}: </span>
                                    {s.name || '—'}
                                </b>
                                {s.size ? <small>Sweater {s.size.toUpperCase()}</small> : null}
                            </span>
                        </div>
                    ))}
                </div>
            </>
        );
    }

    if (state === 'confirmed') {
        return (
            <>
                <OkRoundel />
                <h1>
                    You&apos;re in
                    {spotNo != null ? (
                        <>
                            {' '}· No. <span className="g-w">{String(spotNo).padStart(3, '0')}</span>
                        </>
                    ) : null}
                </h1>
                <p>{eventTitle ? `${eventTitle}. ` : ''}Payment received, your spot is locked in. See you there.</p>
            </>
        );
    }

    return (
        <>
            <OkRoundel waiting />
            <h1>Payment received</h1>
            {timedOut ? (
                <p>
                    Your spot is being finalized. It&apos;s yours; the confirmation just hasn&apos;t landed yet. Refresh in a
                    minute or check the event page.
                </p>
            ) : (
                <>
                    <p role="status">Finalizing your spot…</p>
                    <span className="gt-progress" aria-hidden="true" />
                </>
            )}
        </>
    );
}
