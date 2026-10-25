'use client';
import { useTransition } from 'react';
import { isBannedUntil } from '@/lib/ban';
import {
    setVerified,
    grantPlatformAdmin,
    revokePlatformAdmin,
    grantMeetCoordinator,
    revokeMeetCoordinator,
} from './actions';
import { Check, ShieldOff } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export type UserRowData = {
    id: string;
    handle: string;
    display_name: string;
    kind: 'user' | 'shop_page';
    is_verified: boolean;
    location: string | null;
    level: number;
    xp_total: number;
    created_at: string;
    isPlatformAdmin: boolean;
    isMeetCoordinator: boolean;
    /** Rollout ban end (migration 091); undefined/null before it is applied. */
    banned_until?: string | null;
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

    // Platform admin is security-relevant: both directions ask, naming the member.
    const grantGod = async () => {
        const ok = await confirmDialog({
            title: `Make @${user.handle} a platform admin?`,
            message: 'God mode opens every admin page and action on Rollout. This is logged.',
            confirmLabel: 'Grant',
            danger: true,
        });
        if (ok) handleAction(() => grantPlatformAdmin(user.id, adminProfileId));
    };
    const revokeGod = async () => {
        const ok = await confirmDialog({
            title: `Revoke god mode from @${user.handle}?`,
            message: 'They lose access to the admin pages. This is logged.',
            confirmLabel: 'Revoke',
            danger: true,
        });
        if (ok) handleAction(() => revokePlatformAdmin(user.id));
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
                    {user.kind === 'shop_page' ? 'Shop' : 'User'}
                </span>
            </td>
            <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {user.is_verified && <span className="admin-pill gold"><Check {...ic} /> Verified</span>}
                    {user.isPlatformAdmin && <span className="admin-pill warn">God mode</span>}
                    {user.isMeetCoordinator && <span className="admin-pill neon">Meet coordinator</span>}
                    {isBannedUntil(user.banned_until) && <span className="admin-pill warn">Banned</span>}
                </div>
            </td>
            <td>
                <span className={a.num}>L{user.level}</span> <span className={a.time}>· {user.xp_total} XP</span>
            </td>
            <td className={a.time}>{new Date(user.created_at).toISOString().slice(0, 10)}</td>
            <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                        className={`admin-action-btn ${user.is_verified ? 'muted' : ''}`}
                        disabled={pending}
                        onClick={() => handleAction(() => setVerified(user.id, !user.is_verified))}
                    >
                        {user.is_verified ? 'Unverify' : <><Check {...ic} /> Verify</>}
                    </button>
                    {user.kind === 'user' && (
                        user.isPlatformAdmin ? (
                            <button
                                className="admin-action-btn danger"
                                disabled={pending || isMe}
                                onClick={revokeGod}
                                title={isMe ? "You can't revoke your own admin." : ''}
                            >
                                <ShieldOff {...ic} className={a.dangerIc} /> Revoke god mode
                            </button>
                        ) : (
                            <button
                                className="admin-action-btn"
                                disabled={pending}
                                onClick={grantGod}
                            >
                                Grant god mode
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
                                Remove coordinator
                            </button>
                        ) : (
                            <button
                                className="admin-action-btn"
                                disabled={pending}
                                onClick={() => handleAction(() => grantMeetCoordinator(user.id, adminProfileId))}
                            >
                                Make coordinator
                            </button>
                        )
                    )}
                </div>
            </td>
        </tr>
    );
}
