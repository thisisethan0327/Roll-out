'use client';
import { useTransition } from 'react';
import {
    acceptAppointment,
    declineAppointment,
    convertAppointmentToTicket,
    acceptReschedule,
    declineReschedule,
} from './actions';
import { ArrowRight, Check, X } from 'lucide-react';
import { shopStyles as sh } from '@/components/glide-shop/parts';

const ROW: React.CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' };
const IC = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

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
            <div style={ROW}>
                <button
                    type="button"
                    className={`g-sec ${sh.secSm}`}
                    disabled={pending}
                    onClick={() => run(() => acceptAppointment(appointmentId, shopId))}
                >
                    <Check {...IC} />
                    Accept
                </button>
                <button
                    type="button"
                    className={`g-sec g-sec--ink ${sh.secSm} ${sh.danger}`}
                    disabled={pending}
                    onClick={() => {
                        const reason = prompt('Decline reason (optional):', '');
                        if (reason === null) return; // cancelled
                        run(() => declineAppointment(appointmentId, shopId, reason));
                    }}
                >
                    <X {...IC} />
                    Decline
                </button>
            </div>
        );
    }

    if (status === 'accepted') {
        return (
            <div style={ROW}>
                <button
                    type="button"
                    className={`g-sec ${sh.secSm}`}
                    disabled={pending}
                    onClick={() => run(() => convertAppointmentToTicket(appointmentId, shopId))}
                >
                    Convert to ticket
                    <ArrowRight {...IC} />
                </button>
            </div>
        );
    }

    if (status === 'reschedule_requested') {
        return (
            <div style={ROW}>
                <button
                    type="button"
                    className={`g-sec ${sh.secSm}`}
                    disabled={pending}
                    onClick={() => run(() => acceptReschedule(appointmentId, shopId))}
                >
                    <Check {...IC} />
                    Accept new time
                </button>
                <button
                    type="button"
                    className={`g-sec g-sec--ink ${sh.secSm} ${sh.danger}`}
                    disabled={pending}
                    onClick={() => run(() => declineReschedule(appointmentId, shopId))}
                >
                    <X {...IC} />
                    Decline new time
                </button>
            </div>
        );
    }

    return <span className={sh.muted}>—</span>;
}
