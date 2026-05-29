'use client';
import { useTransition } from 'react';
import {
    acceptAppointment,
    declineAppointment,
    convertAppointmentToTicket,
} from './actions';

export function AppointmentActions({
    appointmentId,
    shopId,
    status,
}: {
    appointmentId: string;
    shopId: number;
    status: string;
}) {
    const [pending, start] = useTransition();

    const run = (fn: () => Promise<void>) => {
        start(async () => {
            try {
                await fn();
            } catch (e: any) {
                alert('Action failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (status === 'pending') {
        return (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => run(() => acceptAppointment(appointmentId, shopId))}
                >
                    ACCEPT
                </button>
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={() => {
                        const reason = prompt('Decline reason (optional):', '');
                        if (reason === null) return; // cancelled
                        run(() => declineAppointment(appointmentId, shopId, reason));
                    }}
                >
                    DECLINE
                </button>
            </div>
        );
    }

    if (status === 'accepted') {
        return (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => run(() => convertAppointmentToTicket(appointmentId, shopId))}
                >
                    CONVERT TO TICKET ›
                </button>
            </div>
        );
    }

    return <span className="admin-handle">—</span>;
}
