'use client';
import { useTransition } from 'react';
import {
    setVerified,
    grantPlatformAdmin,
    revokePlatformAdmin,
    grantMeetCoordinator,
    revokeMeetCoordinator,
} from './actions';

export type UserRowData = {
    id: string;
    handle: string;
    display_name: string;
    kind: 'user' | 'shop_page';
    is_verified: boolean;
    location: string | null;
    rep_tier: number;
    rep_score: number;
    created_at: string;
    isPlatformAdmin: boolean;
    isMeetCoordinator: boolean;
};

export function UserRow({
    user,
    adminProfileId,
}: {
    user: UserRowData;
    adminProfileId: string;
}) {
    const [pending, start] = useTransition();
    const isMe = user.id === adminProfileId;

    const handleAction = (fn: () => Promise<void>) => {
        start(async () => {
            try {
                await fn();
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <tr>
            <td>
                <a href={`/admin/users/${user.id}`} className="text-link">
                    @{user.handle}
                </a>
            </td>
            <td>
                {user.display_name}
                {user.location && (
                    <div className="admin-handle">{user.location}</div>
                )}
            </td>
            <td>
                <span className={`admin-pill ${user.kind === 'shop_page' ? 'gold' : ''}`}>
                    {user.kind === 'shop_page' ? 'SHOP' : 'USER'}
                </span>
            </td>
            <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {user.is_verified && <span className="admin-pill gold">✓ VERIFIED</span>}
                    {user.isPlatformAdmin && <span className="admin-pill warn">GOD</span>}
                    {user.isMeetCoordinator && <span className="admin-pill neon">MEET COORD</span>}
                </div>
            </td>
            <td>
                T{user.rep_tier} · {user.rep_score}
            </td>
            <td>{new Date(user.created_at).toISOString().slice(0, 10)}</td>
            <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                        className={`admin-action-btn ${user.is_verified ? 'muted' : ''}`}
                        disabled={pending}
                        onClick={() => handleAction(() => setVerified(user.id, !user.is_verified))}
                    >
                        {user.is_verified ? 'UNVERIFY' : 'VERIFY ✓'}
                    </button>
                    {user.kind === 'user' && (
                        user.isPlatformAdmin ? (
                            <button
                                className="admin-action-btn danger"
                                disabled={pending || isMe}
                                onClick={() =>
                                    confirm('Revoke god mode from @' + user.handle + '?') &&
                                    handleAction(() => revokePlatformAdmin(user.id))
                                }
                                title={isMe ? "You can't revoke your own admin." : ''}
                            >
                                REVOKE GOD
                            </button>
                        ) : (
                            <button
                                className="admin-action-btn"
                                disabled={pending}
                                onClick={() => handleAction(() => grantPlatformAdmin(user.id, adminProfileId))}
                            >
                                + GOD
                            </button>
                        )
                    )}
                    {user.kind === 'user' && (
                        user.isMeetCoordinator ? (
                            <button
                                className="admin-action-btn muted"
                                disabled={pending}
                                onClick={() => handleAction(() => revokeMeetCoordinator(user.id))}
                            >
                                − COORD
                            </button>
                        ) : (
                            <button
                                className="admin-action-btn"
                                disabled={pending}
                                onClick={() => handleAction(() => grantMeetCoordinator(user.id, adminProfileId))}
                            >
                                + COORD
                            </button>
                        )
                    )}
                </div>
            </td>
        </tr>
    );
}
