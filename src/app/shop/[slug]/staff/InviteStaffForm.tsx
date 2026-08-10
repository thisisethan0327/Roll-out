'use client';
/**
 * Owner-only staff invite. Founder rule: staff are ADDED by the shop admin, they
 * don't self-sign-up. Enter an email + role → inviteStaffByEmail finds/creates
 * the platform account (stamped app='rollout' so they never become EMWRAPS
 * staff), grants shop_memberships(role), and emails them a branded sign-in link.
 */
import { useState, useTransition } from 'react';
import { inviteStaffByEmail } from './actions';

const ROLES = ['owner', 'admin', 'manager', 'installer', 'staff'] as const;

export function InviteStaffForm({
    shopId,
    slug,
}: {
    shopId: number;
    slug: string;
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<(typeof ROLES)[number]>('installer');
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setOk(null);
        const target = email.trim().toLowerCase();
        if (!target) return;
        start(async () => {
            const res = await inviteStaffByEmail(target, role, shopId, slug);
            if (!res.ok) {
                setErr(res.error);
                return;
            }
            setEmail('');
            const who = res.created ? 'New member created' : 'Existing member added';
            setOk(
                `${who} · ${res.email} as ${res.role.toUpperCase()}` +
                    (res.emailed ? ' · invite emailed' : ' · email not sent (they can still sign in)'),
            );
        });
    };

    return (
        <form onSubmit={submit} className="admin-form" style={{ marginTop: 24 }}>
            <div className="admin-form-label">ADD STAFF BY EMAIL</div>
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="admin-form-input"
                placeholder="name@email.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
            />
            <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                className="admin-form-input"
            >
                {ROLES.map((r) => (
                    <option key={r} value={r}>
                        {r.toUpperCase()}
                    </option>
                ))}
            </select>
            {err && (
                <div className="admin-login-error" style={{ padding: 8 }}>
                    {err}
                </div>
            )}
            {ok && (
                <div
                    style={{
                        padding: 8,
                        fontSize: 11,
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 'var(--track-wide)',
                        border: '1px solid var(--line-mid)',
                        background: 'var(--bg-2)',
                    }}
                >
                    {ok}
                </div>
            )}
            <button
                type="submit"
                disabled={pending || !email.trim()}
                className="admin-form-btn"
            >
                {pending ? 'ADDING…' : '+ ADD STAFF'}
            </button>
            <p
                style={{
                    fontSize: 10,
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 'var(--track-wide)',
                    margin: '2px 0 0',
                }}
            >
                THEY SIGN IN AT /SHOP/LOGIN WITH THIS EMAIL · NO SELF-SIGNUP
            </p>
        </form>
    );
}
