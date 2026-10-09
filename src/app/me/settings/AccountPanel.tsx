'use client';
import { useState, useTransition } from 'react';
import { deleteMyAccountAction, signOutEverywhereAction } from './actions';

const DANGER = { borderColor: '#e5484d', color: '#e5484d' } as const;
const norm = (h: string) => h.trim().replace(/^@+/, '').toLowerCase();

export function AccountPanel({ email, handle }: { email: string | null; handle: string }) {
    const [armed, setArmed] = useState(false);
    const [pending, start] = useTransition();
    const [typed, setTyped] = useState('');
    const [deleting, startDelete] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const matches = norm(typed) !== '' && norm(typed) === norm(handle);
    const subject = encodeURIComponent(`Delete my Rollout account (@${handle})`);
    const body = encodeURIComponent(`Please delete my Rollout account @${handle} (${email ?? 'no email on file'}). I understand this removes my profile, garage, posts and RSVPs permanently.`);

    const close = () => {
        setArmed(false);
        setTyped('');
        setError(null);
    };
    const confirmDelete = () => {
        if (!matches || deleting) return;
        setError(null);
        startDelete(async () => {
            // On success the server action signs out and redirects home, so a result
            // only ever comes back here when something went wrong.
            const res = await deleteMyAccountAction(typed);
            if (!res.ok) setError(res.error);
        });
    };

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
                Permanently deletes your Rollout profile right now. Your sign-in for EMWRAPS, NeferStock and UNITY is not affected. This cannot be undone.
            </div>
            {!armed ? (
                <button type="button" className="admin-action-btn" style={DANGER} onClick={() => setArmed(true)}>
                    DELETE ACCOUNT
                </button>
            ) : (
                <div role="alertdialog" aria-labelledby="delete-acct-title" style={{ border: '1px solid #e5484d', padding: 16, display: 'grid', gap: 12 }}>
                    <div id="delete-acct-title" style={{ color: '#e5484d', fontSize: 12, letterSpacing: 1.5 }}>
                        THIS PERMANENTLY DELETES YOUR ROLLOUT PROFILE
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        What happens:
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 3 }}>
                            <li>Your profile is wiped: name, bio, location and photos. Your handle is released.</li>
                            <li>Your posts and your garage are removed.</li>
                            <li>Your RSVPs, follows, followers and blocks are removed.</li>
                            <li>
                                Your sign-in is kept. It is shared with EMWRAPS, NeferStock and UNITY, and your access and
                                orders there are not affected. You are signed out on all your devices afterwards.
                            </li>
                            <li>Records we must keep, such as orders, payments and safety reports, are retained.</li>
                            <li>There is no undo. If you sign in to Rollout again later, you start with a brand-new profile.</li>
                        </ul>
                    </div>
                    <div>
                        <label className="admin-form-label" htmlFor="delete-acct-handle">
                            TYPE YOUR HANDLE (@{handle}) TO CONFIRM
                        </label>
                        <input
                            id="delete-acct-handle"
                            className="admin-form-input"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={`@${handle}`}
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            disabled={deleting}
                            style={{ fontSize: 16 }}
                        />
                    </div>
                    {error && (
                        <div role="alert" style={{ color: '#e5484d', fontSize: 12 }}>
                            {error}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" className="admin-action-btn" style={DANGER} disabled={!matches || deleting} onClick={confirmDelete}>
                            {deleting ? 'DELETING…' : 'DELETE MY ACCOUNT FOREVER'}
                        </button>
                        <button type="button" className="admin-action-btn muted" disabled={deleting} onClick={close}>
                            CANCEL
                        </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        Trouble deleting?{' '}
                        <a href={`mailto:support@rollout.club?subject=${subject}&body=${body}`} style={{ color: 'var(--text-2)' }}>
                            Email support@rollout.club
                        </a>{' '}
                        and we will do it within 24 hours.
                    </div>
                </div>
            )}
        </div>
    );
}
