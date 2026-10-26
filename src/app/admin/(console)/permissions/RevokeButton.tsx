'use client';
/**
 * Revoke a platform role. Platform admin is security-relevant, so it asks
 * through confirmDialog (as god mode does on the users pages); meet
 * coordinator is a row-level change, so a two-click armed button with no
 * timer. Failures are an error toast.
 */
import { useTransition } from 'react';
import {
    revokePlatformAdmin,
    revokeMeetCoordinator,
} from '../users/actions';
import { ShieldOff } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';
import { toast } from '@/components/glide/Toast';
import { useArmed } from '@/lib/overlay/useArmed';

export function RevokeButton({
    kind,
    profileId,
    handle,
    disabled,
}: {
    kind: 'platform_admin' | 'meet_coordinator';
    profileId: string;
    handle: string;
    disabled?: boolean;
}) {
    const [pending, start] = useTransition();
    const [armed, arm] = useArmed();
    const run = () =>
        start(async () => {
            try {
                if (kind === 'platform_admin') await revokePlatformAdmin(profileId);
                else await revokeMeetCoordinator(profileId);
            } catch (e: any) {
                toast.error(`Revoke for @${handle} failed: ` + (e?.message ?? 'unknown'));
            }
        });
    const onClick = async () => {
        if (kind === 'meet_coordinator') return arm('revoke', run);
        const ok = await confirmDialog({
            title: `Revoke god mode from @${handle}?`,
            message: 'They lose access to the admin pages. This is logged.',
            confirmLabel: 'Revoke',
            danger: true,
        });
        if (ok) run();
    };
    const isArmed = armed === 'revoke';
    return (
        <button
            className="admin-action-btn danger"
            disabled={pending || disabled}
            onClick={onClick}
            aria-pressed={kind === 'meet_coordinator' ? isArmed : undefined}
            title={disabled ? "You can't revoke yourself." : undefined}
        >
            <ShieldOff size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} />{' '}
            {isArmed ? `Tap again to revoke @${handle}` : 'Revoke'}
        </button>
    );
}
