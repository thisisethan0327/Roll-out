'use client';
/** "Request a refund" for one ticket on a temporary suspension. An admin decides. */
import { useState, useTransition } from 'react';
import { requestBanRefundAction } from './actions';

export function RequestRefundButton({ orderId, ticketId }: { orderId: string | null; ticketId: string | null }) {
    const [pending, start] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    return (
        <span style={{ display: 'inline-grid', gap: 4, justifyItems: 'end' }}>
            <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
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
                {pending ? 'Requesting…' : 'Request a refund'}
            </button>
            {msg ? <span style={{ fontSize: 12 }}>{msg}</span> : null}
            {err ? <span style={{ fontSize: 12, color: 'var(--warn)' }}>{err}</span> : null}
        </span>
    );
}
