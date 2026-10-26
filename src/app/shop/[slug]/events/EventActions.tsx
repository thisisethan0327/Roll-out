'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelEvent, uncancelEvent } from './actions';
import { confirmDialog } from '@/components/glide/confirm';
import { toast } from '@/components/glide/Toast';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function EventActions({
    eventId,
    shopId,
    slug,
    cancelled,
    callerRole,
    title,
}: {
    eventId: string;
    shopId: number;
    slug: string;
    cancelled: boolean;
    callerRole: string;
    /** Named in the cancel confirm. */
    title?: string | null;
}) {
    const [pending, start] = useTransition();
    const router = useRouter();
    const canManage = MANAGER_ROLES.has(callerRole);

    const run = (fn: () => Promise<void>) => {
        start(async () => {
            try {
                await fn();
            } catch (e: any) {
                toast.error('Action failed: ' + (e?.message ?? 'unknown'));
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
                Edit
            </button>
            {canManage && !cancelled && (
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={async () => {
                        const ok = await confirmDialog({
                            title: `Cancel ${title ? `"${title}"` : 'this event'}?`,
                            message: "People who RSVP'd see it as cancelled. You can uncancel it later.",
                            confirmLabel: 'Cancel event',
                            cancelLabel: 'Keep event',
                        });
                        if (ok) run(() => cancelEvent(eventId, shopId));
                    }}
                >
                    Cancel
                </button>
            )}
            {canManage && cancelled && (
                <button
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => run(() => uncancelEvent(eventId, shopId))}
                >
                    Uncancel
                </button>
            )}
        </div>
    );
}
