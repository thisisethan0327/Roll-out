'use client';
import { useEffect, useState, useTransition } from 'react';
import { requestAppointmentAction } from './actions';
import { SERVICE_LABEL, SERVICE_TYPES } from './services';
import { browserTimeZone } from '@/lib/event-time';
import { PendingButton } from '@/components/feedback';

export function BookForm({
    shopId,
    handle,
    vehicles,
}: {
    shopId: number;
    handle: string;
    vehicles: { id: string; label: string }[];
}) {
    const [tz, setTz] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [pending, start] = useTransition();
    useEffect(() => setTz(browserTimeZone()), []);

    return (
        <form
            className="admin-login-form"
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                    setErr(null);
                    const res = await requestAppointmentAction(fd);
                    if (res && !res.ok) setErr(res.error); // success redirects
                });
            }}
        >
            <input type="hidden" name="shop_id" value={shopId} />
            <input type="hidden" name="handle" value={handle} />
            <input type="hidden" name="preferred_at_tz" value={tz} />

            <label className="admin-login-label">SERVICE</label>
            <select name="service_type" className="admin-login-input" required defaultValue="">
                <option value="" disabled>
                    Pick a service
                </option>
                {SERVICE_TYPES.map((s) => (
                    <option key={s} value={s}>
                        {SERVICE_LABEL[s]}
                    </option>
                ))}
            </select>

            <label className="admin-login-label">PREFERRED DATE &amp; TIME · OPTIONAL</label>
            <input type="datetime-local" name="preferred_at" className="admin-login-input" />
            <div style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                {tz ? `YOUR ZONE · ${tz.toUpperCase()}` : ' '}
            </div>

            {vehicles.length > 0 ? (
                <>
                    <label className="admin-login-label">VEHICLE · OPTIONAL</label>
                    <select name="vehicle_id" className="admin-login-input" defaultValue="">
                        <option value="">Not now</option>
                        {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.label}
                            </option>
                        ))}
                    </select>
                </>
            ) : null}

            <label className="admin-login-label">NOTES · OPTIONAL</label>
            <textarea name="notes" className="admin-login-input" rows={4} maxLength={600} placeholder="What you have in mind, colours, deadlines…" style={{ resize: 'vertical', fontFamily: 'inherit' }} />

            {err ? <div className="admin-login-error">{err}</div> : null}

            <PendingButton type="submit" pending={pending} pendingLabel="SENDING" className="admin-login-btn">
                SEND REQUEST ›
            </PendingButton>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 8 }}>
                The shop confirms a time from its console; you will see the request under My account → Appointments.
            </div>
        </form>
    );
}
