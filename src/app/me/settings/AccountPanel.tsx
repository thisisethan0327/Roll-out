'use client';
import { useState, useTransition } from 'react';
import { signOutEverywhereAction } from './actions';

export function AccountPanel({ email, handle }: { email: string | null; handle: string }) {
    const [armed, setArmed] = useState(false);
    const [pending, start] = useTransition();
    const subject = encodeURIComponent(`Delete my Rollout account (@${handle})`);
    const body = encodeURIComponent(`Please delete my Rollout account @${handle} (${email ?? 'no email on file'}). I understand this removes my profile, garage, posts and RSVPs permanently.`);
    return (
        <div>
            <div className="admin-form-label">EMAIL</div>
            <div className="admin-form-input" style={{ color: 'var(--text-2)', marginBottom: 6 }} aria-readonly="true">{email ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>Your sign-in email. To change it, contact support@rollout.club.</div>

            <div className="admin-form-label">SESSIONS</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>Signs you out of Rollout on every device and browser, including this one.</div>
            <button type="button" className="admin-action-btn muted" disabled={pending} onClick={() => start(async () => { await signOutEverywhereAction(); })} style={{ marginBottom: 24 }}>
                {pending ? 'SIGNING OUT…' : 'SIGN OUT EVERYWHERE'}
            </button>

            <div className="admin-form-label">DELETE MY ACCOUNT</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                Permanent: your profile, garage, posts and RSVPs are removed. Deletion is done by hand within a day of your request — the app can do it instantly from Settings.
            </div>
            {!armed ? (
                <button type="button" className="admin-action-btn muted" onClick={() => setArmed(true)}>REQUEST DELETION</button>
            ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a className="admin-action-btn" href={`mailto:support@rollout.club?subject=${subject}&body=${body}`} style={{ textDecoration: 'none', borderColor: '#e5484d', color: '#e5484d' }}>
                        SEND THE DELETION REQUEST
                    </a>
                    <button type="button" className="admin-action-btn muted" onClick={() => setArmed(false)}>CANCEL</button>
                </div>
            )}
        </div>
    );
}
