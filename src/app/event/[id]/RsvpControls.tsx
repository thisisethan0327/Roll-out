'use client';
/**
 * RSVP control strip for /event/[id]. Three choices — Going / Maybe / Not Going.
 *
 * E0: the Going write goes through rollout.reserve_spot() via the setRsvp server
 * action, so the result is either CONFIRMED (with a numbered spot) or WAITLISTED
 * (with a position in line) — never a silent oversell. The strip stays one-tap;
 * the status line reflects the atomic outcome.
 *
 * Glide: "going" is the slide-to-act control (drag, tap or Enter); its done
 * state is the confirmed / waitlisted RSVP and a tap on the knob removes it,
 * exactly as tapping GOING again did. Maybe / Can't go are secondary pills.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRsvp, type RsvpChoice, type RsvpError, type RsvpState } from './actions';
import { GlideButton } from '@/components/glide/primitives';
import { SlideToAct } from '@/components/glide/SlideToAct';

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
    { key: 'going', label: 'Going' },
    { key: 'maybe', label: 'Maybe' },
    { key: 'declined', label: "Can't go" },
];

const ERROR_COPY: Record<RsvpError, string> = {
    auth: 'Sign in to RSVP.',
    full: 'This meet is at capacity.',
    closed: 'RSVPs are closed for this meet.',
    invalid: 'Something went wrong. Refresh and try again.',
    // 'tier' can't occur on a free event's strip, but the union includes it.
    tier: 'This meet uses tiers — refresh and pick one.',
    write: "Couldn't save your RSVP. Try again.",
    // 'paid_spot' (077) can't occur on a free event's strip either — a paid
    // confirmed spot only exists on the tiered path, handled in TiersSection.
    paid_spot: 'Paid spots are cancelled through a refund, not this button.',
    // 088: a private / followers-only event this member isn't invited to.
    invite_only: 'This event is invite-only.',
    suspended: 'Your account is suspended.',
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
            <>
                <GlideButton href={`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`} plain block>
                    Sign in to RSVP
                </GlideButton>
                <p className="g-panel-line">RSVP right here on the web. No app needed.</p>
            </>
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
        ? msg
        : state === 'confirmed'
            ? spotNo != null
                ? `You're in, spot ${String(spotNo).padStart(3, '0')}. Tap the knob to remove your RSVP.`
                : "You're on the convoy. Tap the knob to remove your RSVP."
            : state === 'waitlisted'
                ? waitPos != null
                    ? `Waitlisted, number ${waitPos} in line. Tap the knob to leave.`
                    : 'Waitlisted. Tap the knob to leave.'
                : state === 'maybe'
                    ? 'Marked as maybe.'
                    : state === 'declined'
                        ? "Marked as can't go."
                        : 'Slide, tap or press Enter to RSVP.';

    const going = isGoingState(state);
    const doneLabel =
        state === 'waitlisted'
            ? waitPos != null
                ? <>Waitlisted <small className="g-w">#{waitPos}</small></>
                : 'Waitlisted'
            : spotNo != null
                ? <>You&apos;re in <small className="g-w">#{String(spotNo).padStart(3, '0')}</small></>
                : "You're in";

    return (
        <>
            <SlideToAct
                label="Slide to RSVP"
                ariaLabel="RSVP: going"
                doneLabel={doneLabel}
                doneAriaLabel={state === 'waitlisted' ? 'Leave the waitlist' : 'Remove your RSVP'}
                done={going}
                busy={pending}
                onComplete={() => choose('going')}
                onUndo={() => choose('going')}
            />
            <div className="g-panel-sub" role="group" aria-label="Other answers">
                {CHOICES.filter((c) => c.key !== 'going').map((c) => (
                    <button
                        key={c.key}
                        type="button"
                        className="g-sec g-sec--ink"
                        disabled={pending}
                        onClick={() => choose(c.key)}
                        aria-pressed={activeKey === c.key}
                    >
                        {c.label}
                    </button>
                ))}
            </div>
            <p className={`g-panel-status${msg ? ' is-error' : ''}`} role="status" aria-live="polite">
                {statusLine}
            </p>
        </>
    );
}
