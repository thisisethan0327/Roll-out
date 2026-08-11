'use client';
/**
 * RSVP control strip for /event/[id]. Three states — Going / Maybe / Not Going —
 * with the current choice highlighted. Writes via the setRsvp server action
 * (RLS-enforced). Signed-out users get a sign-in CTA that returns them here.
 *
 * Styling is inline to match the hand-rolled HUD look of the event page (no CSS
 * framework); the gold accent + bracket chrome mirror the rest of the page.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRsvp, type RsvpChoice } from './actions';

type Props = {
    eventId: string;
    isLoggedIn: boolean;
    initialStatus: RsvpChoice | null;
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

const ERROR_COPY: Record<'auth' | 'full' | 'closed' | 'invalid' | 'write', string> = {
    auth: 'Sign in to RSVP.',
    full: 'This meet is at capacity.',
    closed: 'RSVPs are closed for this meet.',
    invalid: 'Something went wrong. Refresh and try again.',
    write: "Couldn't save your RSVP. Try again.",
};

export function RsvpControls({ eventId, isLoggedIn, initialStatus, nextPath, inviteToken }: Props) {
    const router = useRouter();
    const [status, setStatus] = useState<RsvpChoice | null>(initialStatus);
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

    const choose = (choice: RsvpChoice) => {
        if (pending) return;
        setMsg(null);
        // Toggle off if tapping the active choice → clears the RSVP.
        const next = status === choice ? null : choice;
        const prev = status;
        setStatus(next); // optimistic
        startTransition(async () => {
            const res = await setRsvp(eventId, next, inviteToken ?? null);
            if (res.ok) {
                setStatus(res.status);
                router.refresh();
            } else {
                setStatus(prev); // rollback
                if (res.error === 'auth') {
                    router.push(`/login?next=${encodeURIComponent(nextPath)}&error=rsvp`);
                    return;
                }
                setMsg(ERROR_COPY[res.error]);
            }
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div
                role="group"
                aria-label="RSVP"
                style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}
            >
                {CHOICES.map((c) => {
                    const active = status === c.key;
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
                            {c.label}
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
                {msg
                    ? msg.toUpperCase()
                    : status === 'going'
                        ? "YOU'RE ON THE CONVOY · TAP AGAIN TO REMOVE"
                        : status === 'maybe'
                            ? 'MARKED AS MAYBE'
                            : status === 'declined'
                                ? "MARKED AS CAN'T GO"
                                : 'TAP TO RSVP'}
            </p>
        </div>
    );
}
