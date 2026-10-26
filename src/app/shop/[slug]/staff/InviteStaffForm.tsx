'use client';
/**
 * Owner-only staff invite. Founder rule: staff are ADDED by the shop admin, they
 * don't self-sign-up. Enter an email + role → inviteStaffByEmail finds/creates
 * the platform account (stamped app='rollout' so they never become EMWRAPS
 * staff), grants shop_memberships(role), and emails them a branded sign-in link.
 */
import { useState, useTransition } from 'react';
import { inviteStaffByEmail } from './actions';
import { PendingButton } from '@/components/feedback';
import { LogIn, UserPlus } from 'lucide-react';
import { CardHead, Field } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import { toast } from '@/components/glide/Toast';
import bz from '@/components/glide-shopbiz/biz.module.css';

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

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
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
            const line = `${who} · ${res.email} as ${res.role.charAt(0).toUpperCase() + res.role.slice(1)}`;
            // Not emailed is something to act on, so that one stays until dismissed.
            if (res.emailed) toast.success(line, { description: 'Invite emailed' });
            else toast.warning(line, { description: 'Email not sent. They can still sign in.' });
        });
    };

    const inp = cx(cs.input, bz.in);

    return (
        <section className={cx('g-card', bz.narrow)} aria-labelledby="inv-h">
            <CardHead id="inv-h" title="Add staff" />
            <form onSubmit={submit} className={cx(cs.cardBody, cs.form)} style={{ paddingBottom: 30 }}>
                <div className={cs.grid2f}>
                <Field label="Email" htmlFor="inv-email">
                    <input
                        id="inv-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inp}
                        placeholder="name@email.com"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                </Field>
                <Field label="Role" htmlFor="inv-role">
                    <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className={inp}>
                        {ROLES.map((r) => (
                            <option key={r} value={r}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                            </option>
                        ))}
                    </select>
                </Field>
                </div>
                {err && (
                    <Notice tone="bad" live>
                        {err}
                    </Notice>
                )}
                <div>
                    <PendingButton
                        type="submit"
                        pending={pending}
                        pendingLabel="Adding"
                        disabled={!email.trim()}
                        className="g-btn g-btn--sm"
                    >
                        <span>Add staff</span>
                        <span className="g-btn-k" aria-hidden="true">
                            <UserPlus size={18} strokeWidth={2} />
                        </span>
                    </PendingButton>
                </div>
                <p className={bz.fine}>
                    <LogIn size={15} strokeWidth={2} aria-hidden="true" />
                    They sign in at /shop/login with this email.
                </p>
            </form>
        </section>
    );
}
