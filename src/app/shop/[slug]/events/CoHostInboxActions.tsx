'use client';
/**
 * Accept/Decline controls for a co-host invitation shown in a shop's events
 * list ("CO-HOSTING" section). Thin wrapper over the respondCoHost action.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { respondCoHost } from './[id]/invite-actions';
import { toast } from '@/components/glide/Toast';

export function CoHostInboxActions({
    eventId,
    shopId,
    status,
}: {
    eventId: string;
    shopId: number;
    status: string;
}) {
    const [pending, start] = useTransition();
    const router = useRouter();

    const respond = (accept: boolean) => {
        start(async () => {
            try {
                await respondCoHost(eventId, shopId, accept);
                router.refresh();
            } catch (e: any) {
                toast.error('Failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (status === 'invited') {
        return (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="admin-action-btn" disabled={pending} onClick={() => respond(true)}>
                    Accept
                </button>
                <button className="admin-action-btn danger" disabled={pending} onClick={() => respond(false)}>
                    Decline
                </button>
            </div>
        );
    }
    return null;
}
