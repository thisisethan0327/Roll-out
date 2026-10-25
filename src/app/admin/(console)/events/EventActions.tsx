'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { forceCancelEvent } from '../moderation-actions';
import { CancelAndRefundAllButton } from '@/components/CancelAndRefundAllButton';
import { CalendarX } from 'lucide-react';
import { adminStyles as a } from '@/components/glide-admin/parts';
import { confirmDialog } from '@/components/glide/confirm';

export function EventActions({
    eventId,
    eventTitle,
    isPaid,
}: {
    eventId: string;
    eventTitle: string;
    /** rsvp_mode is 'tiered' | 'paid' — routes to the refund-aware cancel. */
    isPaid: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const onCancel = async () => {
        const ok = await confirmDialog({
            title: `Cancel ${eventTitle ? `"${eventTitle}"` : 'this event'}?`,
            message: "Force-cancel as platform admin. People who RSVP'd see it as cancelled.",
            confirmLabel: 'Cancel event',
            cancelLabel: 'Keep event',
        });
        if (!ok) return;
        start(async () => {
            try {
                await forceCancelEvent(eventId);
                router.refresh();
            } catch (e: any) {
                alert('Failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (isPaid) {
        return (
            <CancelAndRefundAllButton
                eventId={eventId}
                eventTitle={eventTitle}
                onDone={() => router.refresh()}
                className="admin-action-btn danger"
            />
        );
    }

    return (
        <button className="admin-action-btn danger" disabled={pending} onClick={onCancel}>
            <CalendarX size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Cancel event
        </button>
    );
}
