'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelEvent, uncancelEvent } from './actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function EventActions({
    eventId,
    shopId,
    slug,
    cancelled,
    callerRole,
}: {
    eventId: string;
    shopId: number;
    slug: string;
    cancelled: boolean;
    callerRole: string;
}) {
    const [pending, start] = useTransition();
    const router = useRouter();
    const canManage = MANAGER_ROLES.has(callerRole);

    const run = (fn: () => Promise<void>) => {
        start(async () => {
            try {
                await fn();
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
                className="admin-action-btn muted"
                disabled={pending}
                onClick={() => router.push(`/shop/${slug}/events/${eventId}`)}
            >
                EDIT
            </button>
            {canManage && !cancelled && (
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={() => {
                        if (!confirm('Cancel this event? RSVPs will see it as cancelled.')) return;
                        run(() => cancelEvent(eventId, shopId));
                    }}
                >
                    CANCEL
                </button>
            )}
            {canManage && cancelled && (
                <button
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => run(() => uncancelEvent(eventId, shopId))}
                >
                    UNCANCEL
                </button>
            )}
        </div>
    );
}
