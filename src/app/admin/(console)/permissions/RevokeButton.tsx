'use client';
import { useTransition } from 'react';
import {
    revokePlatformAdmin,
    revokeMeetCoordinator,
} from '../users/actions';
import { ShieldOff } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';

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
    const onClick = () => {
        if (!confirm(`Revoke ${kind.replace('_', ' ')} from @${handle}?`)) return;
        start(async () => {
            try {
                if (kind === 'platform_admin') await revokePlatformAdmin(profileId);
                else await revokeMeetCoordinator(profileId);
            } catch (e: any) {
                alert('Failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };
    return (
        <button
            className="admin-action-btn danger"
            disabled={pending || disabled}
            onClick={onClick}
            title={disabled ? "You can't revoke yourself." : ''}
        >
            <ShieldOff size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Revoke
        </button>
    );
}
