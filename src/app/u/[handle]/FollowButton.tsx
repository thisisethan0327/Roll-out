'use client';
/**
 * The profile's primary action for a MEMBER page, on the web: Follow /
 * Following, with the follower count beside it. Signed-out visitors get the
 * sign-in door; your own page shows nothing here.
 *
 * Glide: Follow is the primary pill with the knob; Following is the
 * secondary pill in its pressed (tint) state.
 */
import { useState, useTransition } from 'react';
import { toggleFollowAction } from './follow-actions';
import { SUSPENDED_MESSAGE } from '@/lib/ban';
import { UserCheck, UserPlus } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';

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
            <GlideButton href={`/login?next=${encodeURIComponent(`/u/${handle}`)}`} size="sm" icon={<UserPlus size={18} strokeWidth={2} />}>
                Sign in to follow
            </GlideButton>
        );
    }
    const toggle = () =>
        start(async () => {
            setErr(null);
            const next = !following;
            setFollowing(next);
            setCount((c) => Math.max(0, c + (next ? 1 : -1)));
            const res = await toggleFollowAction(targetProfileId);
            if (!res.ok) {
                setFollowing(!next);
                setCount((c) => Math.max(0, c + (next ? -1 : 1)));
                setErr(
                    res.reason === 'signin'
                        ? 'Sign in to follow.'
                        : res.reason === 'suspended'
                          ? SUSPENDED_MESSAGE
                          : 'Could not update. Try again.',
                );
            } else {
                setFollowing(res.following);
            }
        });
    return (
        <>
            {following ? (
                <button type="button" className="g-sec" aria-pressed="true" disabled={pending} onClick={toggle}>
                    <UserCheck size={18} strokeWidth={2} aria-hidden="true" />
                    Following
                </button>
            ) : (
                <GlideButton size="sm" aria-pressed={false} disabled={pending} onClick={toggle} icon={<UserPlus size={18} strokeWidth={2} />}>
                    Follow
                </GlideButton>
            )}
            <span className="gd-stat" aria-live="polite">
                <span className="g-w">{count}</span> {count === 1 ? 'follower' : 'followers'}
            </span>
            {err ? (
                <p className="gd-id-err" role="alert" style={{ flexBasis: '100%' }}>
                    {err}
                </p>
            ) : null}
        </>
    );
}
