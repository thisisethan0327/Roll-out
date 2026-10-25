'use client';
/**
 * Booking request actions for the shop inbox. Decline asks for its optional
 * reason in the Glide confirmDialog (not prompt(), which a browser can
 * auto-dismiss); the reason is shown to the customer on their appointments
 * page, and the dialog says so.
 */
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
import { confirmDialog } from '@/components/glide/confirm';

const ROW: React.CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' };
const IC = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

export function AppointmentActions({
    appointmentId,
    shopId,
    status,
    handle,
}: {
    appointmentId: string;
    shopId: number;
    status: string;
    /** The customer who asked; null when the profile could not be read. */
    handle?: string | null;
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
                    onClick={async () => {
                        const who = handle ? `@${handle}` : 'the customer';
                        const reason = await confirmDialog({
                            title: `Decline ${handle ? `@${handle}'s` : 'this'} booking request?`,
                            message: `${who} sees the request as declined, with the reason if you give one.`,
                            reason: { label: `Reason (shown to ${who})`, maxLength: 500 },
                            confirmLabel: 'Decline',
                            danger: true,
                        });
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
