'use client';
/**
 * The same account actions the /admin/users row offers, for the detail page.
 * They call the existing server actions in ../actions.ts, each of which
 * re-checks requirePlatformAdmin() server-side.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    setVerified,
    grantPlatformAdmin,
    revokePlatformAdmin,
    grantMeetCoordinator,
    revokeMeetCoordinator,
} from '../actions';

export function UserActions({
    profileId,
    handle,
    kind,
    isVerified,
    isPlatformAdmin,
    isMeetCoordinator,
    adminProfileId,
}: {
    profileId: string;
    handle: string;
    kind: string;
    isVerified: boolean;
    isPlatformAdmin: boolean;
    isMeetCoordinator: boolean;
    adminProfileId: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const isMe = profileId === adminProfileId;

    const run = (fn: () => Promise<void>) => {
        start(async () => {
            try {
                await fn();
                router.refresh();
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
                className={`admin-action-btn ${isVerified ? 'muted' : ''}`}
                disabled={pending}
                onClick={() => run(() => setVerified(profileId, !isVerified))}
            >
                {isVerified ? 'UNVERIFY' : 'VERIFY ✓'}
            </button>
            {kind === 'user' &&
                (isPlatformAdmin ? (
                    <button
                        className="admin-action-btn danger"
                        disabled={pending || isMe}
                        onClick={() =>
                            confirm('Revoke god mode from @' + handle + '?') &&
                            run(() => revokePlatformAdmin(profileId))
                        }
                        title={isMe ? "You can't revoke your own admin." : ''}
                    >
                        REVOKE GOD
                    </button>
                ) : (
                    <button
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => run(() => grantPlatformAdmin(profileId, adminProfileId))}
                    >
                        + GOD
                    </button>
                ))}
            {kind === 'user' &&
                (isMeetCoordinator ? (
                    <button
                        className="admin-action-btn muted"
                        disabled={pending}
                        onClick={() => run(() => revokeMeetCoordinator(profileId))}
                    >
                        − COORD
                    </button>
                ) : (
                    <button
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => run(() => grantMeetCoordinator(profileId, adminProfileId))}
                    >
                        + COORD
                    </button>
                ))}
        </div>
    );
}
