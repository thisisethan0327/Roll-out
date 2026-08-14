'use client';
/**
 * RSVP control strip for /event/[id]. Three choices — Going / Maybe / Not Going.
 *
 * E0: the Going write goes through rollout.reserve_spot() via the setRsvp server
 * action, so the result is either CONFIRMED (with a numbered spot) or WAITLISTED
 * (with a position in line) — never a silent oversell. The strip stays one-tap;
 * the status line reflects the atomic outcome.
 *
 * Styling is inline to match the hand-rolled HUD look of the event page.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRsvp, type RsvpChoice, type RsvpError, type RsvpState } from './actions';

type Props = {
    eventId: string;
    isLoggedIn: boolean;
    initialState: RsvpState;
    initialSpotNo?: number | null;
    initialWaitlistPosition?: number | null;
    /** Full path (with query) to return to after sign-in. */
    nextPath: string;
    /** Per-invite token from ?invite= — stamps invite attribution on RSVP. */
    inviteToken?: string | null;
};

const CHOICES: { key: RsvpChoice; label: string }[] = [
    { key: 'going', label: 'GOING' },
    { key: 'maybe', label: 'MAYBE' },
    { key: 'declined', label: "CAN'T GO" },
];

const ERROR_COPY: Record<RsvpError, string> = {
    auth: 'Sign in to RSVP.',
    full: 'This meet is at capacity.',
    closed: 'RSVPs are closed for this meet.',
    invalid: 'Something went wrong. Refresh and try again.',
    // 'tier' can't occur on a free event's strip, but the union includes it.
    tier: 'This meet uses tiers — refresh and pick one.',
    write: "Couldn't save your RSVP. Try again.",
};

/** Is this state the "going" choice (either confirmed or on the waitlist)? */
function isGoingState(s: RsvpState): boolean {
    return s === 'confirmed' || s === 'waitlisted';
}

export function RsvpControls({
    eventId,
    isLoggedIn,
    initialState,
    initialSpotNo,
    initialWaitlistPosition,
    nextPath,
    inviteToken,
}: Props) {
    const router = useRouter();
    const [state, setState] = useState<RsvpState>(initialState);
    const [spotNo, setSpotNo] = useState<number | null>(initialSpotNo ?? null);
    const [waitPos, setWaitPos] = useState<number | null>(initialWaitlistPosition ?? null);
    const [msg, setMsg] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    if (!isLoggedIn) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <a
                    className="btn btn-lg"
                    href={`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`}
                >
                    Sign In to RSVP
                </a>
                <p
                    className="text-muted"
                    style={{
                        fontSize: 11,
                        margin: 0,
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    RSVP RIGHT HERE ON THE WEB · NO APP NEEDED
                </p>
            </div>
        );
    }

    const activeKey: RsvpChoice | null = isGoingState(state)
        ? 'going'
        : state === 'maybe'
            ? 'maybe'
            : state === 'declined'
                ? 'declined'
                : null;

    const choose = (choice: RsvpChoice) => {
        if (pending) return;
        setMsg(null);
        // Toggle off if tapping the active choice → clears the RSVP.
        const next: RsvpChoice | null = activeKey === choice ? null : choice;
        const prev = { state, spotNo, waitPos };
        // Optimistic: reflect intent immediately (spot/position land on the response).
        setState(next === 'going' ? 'confirmed' : next);
        setSpotNo(null);
        setWaitPos(null);
        startTransition(async () => {
            const res = await setRsvp(eventId, next, inviteToken ?? null);
            if (res.ok) {
                setState(res.state);
                setSpotNo(res.spotNo ?? null);
                setWaitPos(res.waitlistPosition ?? null);
                router.refresh();
            } else {
                setState(prev.state); // rollback
                setSpotNo(prev.spotNo);
                setWaitPos(prev.waitPos);
                if (res.error === 'auth') {
                    router.push(`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`);
                    return;
                }
                setMsg(ERROR_COPY[res.error]);
            }
        });
    };

    const statusLine = msg
        ? msg.toUpperCase()
        : state === 'confirmed'
            ? spotNo != null
                ? `YOU'RE IN · SPOT #${String(spotNo).padStart(3, '0')} · TAP GOING TO REMOVE`
                : "YOU'RE ON THE CONVOY · TAP GOING TO REMOVE"
            : state === 'waitlisted'
                ? waitPos != null
                    ? `WAITLISTED · #${waitPos} IN LINE · TAP GOING TO LEAVE`
                    : 'WAITLISTED · TAP GOING TO LEAVE'
                : state === 'maybe'
                    ? 'MARKED AS MAYBE'
                    : state === 'declined'
                        ? "MARKED AS CAN'T GO"
                        : 'TAP TO RSVP';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div
                role="group"
                aria-label="RSVP"
                style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}
            >
                {CHOICES.map((c) => {
                    const active = activeKey === c.key;
                    // The Going button reads "WAITLIST" once the meet is full and
                    // you're queued, so the label matches your real state.
                    const label =
                        c.key === 'going' && state === 'waitlisted' ? 'WAITLISTED' : c.label;
                    return (
                        <button
                            key={c.key}
                            type="button"
                            disabled={pending}
                            onClick={() => choose(c.key)}
                            aria-pressed={active}
                            style={{
                                minWidth: 116,
                                padding: '13px 20px',
                                border: `1px solid ${active ? 'var(--gold)' : 'var(--line-mid)'}`,
                                background: active ? 'var(--gold)' : 'transparent',
                                color: active ? 'var(--bg-0, #000)' : 'var(--text)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: 'var(--track-wider)',
                                cursor: pending ? 'wait' : 'pointer',
                                opacity: pending ? 0.7 : 1,
                                transition: 'background 120ms, border-color 120ms, color 120ms',
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
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
                {statusLine}
            </p>
        </div>
    );
}
