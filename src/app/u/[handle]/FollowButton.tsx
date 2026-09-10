'use client';
/**
 * The profile's primary action for a MEMBER page, on the web: Follow /
 * Following, with the follower count beside it. Signed-out visitors get the
 * sign-in door; your own page shows nothing here.
 */
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toggleFollowAction } from './follow-actions';

export function FollowButton({
    targetProfileId,
    handle,
    viewer,
    initialFollowing,
    initialCount,
}: {
    targetProfileId: string;
    handle: string;
    viewer: 'anon' | 'self' | 'other';
    initialFollowing: boolean;
    initialCount: number;
}) {
    const [following, setFollowing] = useState(initialFollowing);
    const [count, setCount] = useState(initialCount);
    const [err, setErr] = useState<string | null>(null);
    const [pending, start] = useTransition();

    if (viewer === 'self') return null;
    if (viewer === 'anon') {
        return (
            <Link className="btn btn-lg" href={`/login?next=${encodeURIComponent(`/u/${handle}`)}`}>
                Sign in to follow
            </Link>
        );
    }
    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
                type="button"
                className={following ? 'btn btn-lg btn-ghost' : 'btn btn-lg'}
                disabled={pending}
                aria-pressed={following}
                onClick={() =>
                    start(async () => {
                        setErr(null);
                        const next = !following;
                        setFollowing(next);
                        setCount((c) => Math.max(0, c + (next ? 1 : -1)));
                        const res = await toggleFollowAction(targetProfileId);
                        if (!res.ok) {
                            setFollowing(!next);
                            setCount((c) => Math.max(0, c + (next ? -1 : 1)));
                            setErr(res.reason === 'signin' ? 'Sign in to follow.' : 'Could not update — try again.');
                        } else {
                            setFollowing(res.following);
                        }
                    })
                }
            >
                {following ? 'Following ✓' : 'Follow'}
            </button>
            <span className="mono-row" style={{ fontSize: 10 }}>
                <span className="accent">{count}</span>
                <span>{count === 1 ? 'FOLLOWER' : 'FOLLOWERS'}</span>
            </span>
            {err ? <span style={{ fontSize: 11, color: '#e5484d' }}>{err}</span> : null}
        </div>
    );
}
