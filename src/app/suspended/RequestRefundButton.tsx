'use client';
/** "Request a refund" for one ticket on a temporary suspension. An admin decides. */
import { useState, useTransition } from 'react';
import { requestBanRefundAction } from './actions';
import { LoaderCircle } from 'lucide-react';

export function RequestRefundButton({ orderId, ticketId }: { orderId: string | null; ticketId: string | null }) {
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    return (
        <span className="ga-ticket-act">
            <button
                type="button"
                className="g-sec"
                disabled={pending}
                aria-busy={pending}
                onClick={() => {
                    setErr(null);
                    setMsg(null);
                    start(async () => {
                        const res = await requestBanRefundAction({ orderId, ticketId });
                        if (res.ok) setMsg(res.message ?? 'Refund requested.');
                        else setErr(res.error ?? 'Could not request a refund.');
                    });
                }}
            >
                {pending ? <LoaderCircle size={16} strokeWidth={2} className="g-spin" aria-hidden="true" /> : null}
                {pending ? 'Requesting' : 'Request a refund'}
            </button>
            {msg ? <small role="status">{msg}</small> : null}
            {err ? <small role="alert">{err}</small> : null}
        </span>
    );
}
