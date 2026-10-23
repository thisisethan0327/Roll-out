'use client';
import { useState, useTransition } from 'react';
import { CircleAlert, LoaderCircle, LogOut, Mail, Trash2, TriangleAlert } from 'lucide-react';
import { deleteMyAccountAction, signOutEverywhereAction } from './actions';
import s from '@/components/glide-console/console.module.css';
import st from './settings.module.css';

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
    const ic = { size: 17, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <div className={st.acct}>
            <div className={st.acctRow}>
                <Mail className={st.addrIc} size={22} strokeWidth={1.75} aria-hidden="true" />
                <div className={st.addrT}>
                    <b>Sign-in email</b>
                    <small aria-readonly="true">{email ?? '—'}</small>
                    <small>To change it, contact support@rollout.club.</small>
                </div>
            </div>

            <div className={st.acctRow}>
                <LogOut className={st.addrIc} size={22} strokeWidth={1.75} aria-hidden="true" />
                <div className={st.addrT}>
                    <b>Sessions</b>
                    <small>Signs you out of Rollout on every device and browser, including this one.</small>
                </div>
                <button type="button" className="g-sec g-sec--ink" disabled={pending} aria-busy={pending} onClick={() => start(async () => { await signOutEverywhereAction(); })}>
                    {pending ? <LoaderCircle {...ic} className="g-spin" /> : null}
                    {pending ? 'Signing out…' : 'Sign out everywhere'}
                </button>
            </div>

            <div className={st.acctRow}>
                <Trash2 className={`${st.addrIc} ${st.red}`} size={22} strokeWidth={1.75} aria-hidden="true" />
                <div className={st.addrT}>
                    <b>Delete my account</b>
                    <small>Permanently deletes your Rollout profile right now. Your sign-in for EMWRAPS, NeferStock and UNITY is not affected. This cannot be undone.</small>
                </div>
                {!armed ? (
                    <button type="button" className={`g-sec ${s.danger}`} onClick={() => setArmed(true)}>
                        <Trash2 {...ic} />
                        Delete account
                    </button>
                ) : null}
            </div>

            {armed ? (
                <div role="alertdialog" aria-labelledby="delete-acct-title" className={s.dangerBox}>
                    <h3 id="delete-acct-title">
                        <TriangleAlert size={20} strokeWidth={2} aria-hidden="true" />
                        This permanently deletes your Rollout profile
                    </h3>
                    <div>
                        <p className={s.small} style={{ marginBottom: 6, color: 'var(--ink)', fontWeight: 600 }}>
                            What happens:
                        </p>
                        <ul>
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
                    <div className={s.field}>
                        <label className={s.label} htmlFor="delete-acct-handle">
                            Type your handle (@{handle}) to confirm
                        </label>
                        <input
                            id="delete-acct-handle"
                            className={s.input}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={`@${handle}`}
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            disabled={deleting}
                        />
                    </div>
                    {error && (
                        <p role="alert" className={`${s.hint} ${s.hintBad}`}>
                            <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
                            {error}
                        </p>
                    )}
                    <div className={s.actRow}>
                        <button type="button" className={`g-sec ${s.danger}`} disabled={!matches || deleting} aria-busy={deleting} onClick={confirmDelete}>
                            {deleting ? <LoaderCircle {...ic} className="g-spin" /> : <Trash2 {...ic} />}
                            {deleting ? 'Deleting…' : 'Delete my account forever'}
                        </button>
                        <button type="button" className="g-sec g-sec--ink" disabled={deleting} onClick={close}>
                            Cancel
                        </button>
                    </div>
                    <p className={s.small}>
                        Trouble deleting? <a href={`mailto:support@rollout.club?subject=${subject}&body=${body}`}>Email support@rollout.club</a> and we will do it within 24 hours.
                    </p>
                </div>
            ) : null}
        </div>
    );
}
