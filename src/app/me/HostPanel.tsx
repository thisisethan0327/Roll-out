'use client';
/**
 * "Become a host" panel on the /me overview.
 *
 * Three states driven by the member's host_status:
 *   • none      → pitch + apply form (become_host RPC via becomeHostAction)
 *   • pending   → "under review" notice
 *   • verified  → success + link into /me/events (host your own meets)
 *
 * Nominated members (host_appointed_by_shop_id set) whose status is pending see
 * a slightly different note (a shop vouched for them).
 */
import Link from 'next/link';
import { useActionState } from 'react';
import { becomeHostAction } from './actions';

type HostStatus = 'none' | 'pending' | 'verified';

export function HostPanel({
    hostStatus,
    nominated,
}: {
    hostStatus: HostStatus;
    nominated: boolean;
}) {
    const [state, formAction, pending] = useActionState(becomeHostAction, null);

    return (
        <section
            style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-1)',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--gold)',
                    }}
                >
                    ／ BECOME A HOST
                </div>
                <StatusBadge status={hostStatus} />
            </div>

            {hostStatus === 'verified' ? (
                <>
                    <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                        You’re a verified host. Create your own meets, runs, and shows — they appear on the public Meets directory and map, and you can invite people by email.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link href="/me/events/new" className="admin-action-btn" style={{ textDecoration: 'none' }}>
                            HOST AN EVENT ›
                        </Link>
                        <Link href="/me/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                            MY EVENTS
                        </Link>
                    </div>
                </>
            ) : hostStatus === 'pending' ? (
                <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                    {nominated
                        ? 'A shop nominated you as a host. A Rollout admin is reviewing it — you’ll be able to host your own events once approved.'
                        : 'Your host application is under review. We’ll email you the moment a Rollout admin approves it, and hosting unlocks here.'}
                </p>
            ) : (
                <>
                    <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                        Want to run your own meets? Apply to become an individual host. Once a Rollout admin verifies you, you can create community events (no shop required) and invite people by email.
                    </p>
                    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <textarea
                            name="why"
                            rows={2}
                            maxLength={500}
                            placeholder="Tell us what you want to host (optional) — helps the review."
                            style={{
                                width: '100%',
                                padding: '9px 11px',
                                background: 'var(--bg-2)',
                                border: '1px solid var(--line)',
                                color: 'var(--text)',
                                fontSize: 14,
                                borderRadius: 3,
                                resize: 'vertical',
                                boxSizing: 'border-box',
                            }}
                        />
                        {state?.error ? (
                            <div style={{ color: 'var(--danger, #d33)', fontSize: 12 }}>{state.error}</div>
                        ) : null}
                        <button type="submit" className="admin-action-btn" disabled={pending} style={{ alignSelf: 'flex-start' }}>
                            {pending ? 'SUBMITTING…' : 'APPLY TO HOST ›'}
                        </button>
                    </form>
                </>
            )}
        </section>
    );
}

function StatusBadge({ status }: { status: HostStatus }) {
    const map: Record<HostStatus, { label: string; color: string }> = {
        none: { label: 'NOT A HOST', color: 'var(--text-3)' },
        pending: { label: 'UNDER REVIEW', color: 'var(--gold)' },
        verified: { label: 'VERIFIED HOST', color: 'var(--neon, #6cf)' },
    };
    const s = map[status];
    return (
        <span
            style={{
                fontFamily: 'var(--font-display)',
                fontSize: 9,
                letterSpacing: 2,
                color: s.color,
                border: `1px solid ${s.color}`,
                padding: '3px 8px',
            }}
        >
            {s.label}
        </span>
    );
}
