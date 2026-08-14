'use client';
/**
 * Post-payment confirmation for the event-package checkout (E3).
 *
 * The payment already succeeded and the order is placed — but the RSVP flip
 * (held → confirmed) happens asynchronously in Medusa's order.placed
 * subscriber. So this polls the member's RSVP briefly until the flip lands and
 * then shows the numbered spot. If the flip hasn't landed after the polling
 * window, the spot is still theirs — we say so instead of spinning forever.
 */
import { useEffect, useRef, useState } from 'react';
import { getRsvpSnapshot, type RsvpState } from '../actions';
import { SweepBar } from '../../../store/_ui';

const POLL_MS = 2000;
const MAX_POLLS = 15; // ~30s window — the subscriber usually lands in seconds.

export function ConfirmPoll({
    eventId,
    initialState,
    initialSpotNo,
}: {
    eventId: string;
    initialState: RsvpState;
    initialSpotNo: number | null;
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

    if (state === 'confirmed') {
        return (
            <>
                <div style={{ fontSize: 44, color: 'var(--gold)', marginBottom: 12 }}>✓</div>
                <h1 style={{ letterSpacing: 1, margin: '0 0 14px' }}>
                    YOU&apos;RE IN{spotNo != null ? ` — NO. ${String(spotNo).padStart(3, '0')}` : ''}
                </h1>
                <p style={{ color: 'var(--text-2)', fontSize: 16, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 8px' }}>
                    Payment received — your spot is locked in. See you there.
                </p>
            </>
        );
    }

    return (
        <>
            <h1 style={{ letterSpacing: 1, margin: '0 0 18px' }}>PAYMENT RECEIVED</h1>
            {timedOut ? (
                <p style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 8px' }}>
                    Your spot is being finalized — it&apos;s yours, the confirmation just
                    hasn&apos;t landed yet. Refresh in a minute or check the event page.
                </p>
            ) : (
                <div style={{ maxWidth: 300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <span
                        className="text-dim font-display"
                        style={{ fontSize: 11, letterSpacing: 'var(--track-wider)' }}
                    >
                        FINALIZING YOUR SPOT…
                    </span>
                    <SweepBar />
                </div>
            )}
        </>
    );
}
