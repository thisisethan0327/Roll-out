'use client';
import { useTransition } from 'react';
import { forceCancelEvent } from '../moderation-actions';

export function EventActions({ eventId }: { eventId: string }) {
    const [pending, start] = useTransition();
    const onCancel = () => {
        if (!confirm('Force-cancel this event? RSVPs will see it as cancelled.')) return;
        start(async () => {
            try {
                await forceCancelEvent(eventId);
            } catch (e: any) {
                alert('Failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };
    return (
        <button className="admin-action-btn danger" disabled={pending} onClick={onCancel}>
            CANCEL
        </button>
    );
}
