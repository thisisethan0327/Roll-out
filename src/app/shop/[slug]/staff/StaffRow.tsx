'use client';
/**
 * One staff row. Remove is a two-click armed button (no timer). Nominate
 * host asks through confirmDialog because the nominee is emailed, then
 * confirms with a toast. Failures are error toasts.
 */
import { useTransition } from 'react';
import { removeStaff, setStaffRole, nominateHostAction } from './actions';
import { Check, Clock, Flag, UserMinus } from 'lucide-react';
import cs from '@/components/glide-console/console.module.css';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { confirmDialog } from '@/components/glide/confirm';
import { toast } from '@/components/glide/Toast';
import { useArmed } from '@/lib/overlay/useArmed';

const ROLES = ['owner', 'admin', 'manager', 'installer', 'staff'] as const;

export function StaffRow({
    m,
    shopId,
    slug,
}: {
    m: any;
    shopId: number;
    slug: string;
}) {
    const [pending, start] = useTransition();
    const [armed, arm] = useArmed();
    const p = m.profiles;
    const who = `@${p?.handle ?? 'user'}`;

    const onChangeRole = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const role = e.target.value as (typeof ROLES)[number];
        start(async () => {
            try {
                await setStaffRole(m.profile_id, shopId, slug, role);
            } catch (err: any) {
                toast.error(`Role change for ${who} failed: ` + (err?.message ?? 'unknown'));
            }
        });
    };

    const onRemove = () =>
        arm('remove', () =>
            start(async () => {
                try {
                    await removeStaff(m.profile_id, shopId, slug);
                } catch (err: any) {
                    toast.error(`Removing ${who} failed: ` + (err?.message ?? 'unknown'));
                }
            }),
        );

    const hostStatus: string = p?.host_status ?? 'none';
    const canNominate = (p?.kind ?? 'user') === 'user' && hostStatus === 'none';

    const onNominate = async () => {
        const ok = await confirmDialog({
            title: `Nominate ${who} as a host?`,
            message: `${who} is emailed. A Rollout admin reviews it.`,
            confirmLabel: 'Nominate',
        });
        if (!ok) return;
        start(async () => {
            const res = await nominateHostAction(m.profile_id, shopId, slug);
            if (!res.ok) toast.error(`Nominating ${who} failed: ` + (res.error ?? 'unknown'));
            else toast.success(`${who} nominated as a host`);
        });
    };

    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
    const name: string = p?.display_name || p?.handle || '?';
    const initials = name
        .replace(/^@+/, '')
        .split(/[\s_]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase();

    return (
        <tr>
            <td>
                <div className={cs.cell}>
                    <span className="g-av" aria-hidden="true">
                        {initials}
                    </span>
                    <span style={{ minWidth: 0 }}>
                        <b>{p?.display_name ?? '—'}</b>
                        <small>@{p?.handle ?? '?'}</small>
                    </span>
                </div>
            </td>
            <td>
                <label className="g-sr" htmlFor={`role-${m.profile_id}`}>
                    Role for @{p?.handle ?? 'user'}
                </label>
                <select
                    id={`role-${m.profile_id}`}
                    defaultValue={m.role}
                    onChange={onChangeRole}
                    disabled={pending}
                    className={cx(cs.input, bz.in, bz.selSm)}
                >
                    {ROLES.map((r) => (
                        <option key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                        </option>
                    ))}
                </select>
            </td>
            <td className={cs.mHide}>
                <span className={bz.mono}>{m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : '—'}</span>
            </td>
            <td className={bz.tdActs}>
                <div className={cx(bz.acts, bz.actsEnd)}>
                    {hostStatus === 'verified' ? (
                        <span className="g-chip g-chip--tint" title="Verified individual host">
                            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                            Host
                        </span>
                    ) : hostStatus === 'pending' ? (
                        <span className="g-chip" title="Host nomination under review">
                            <Clock size={14} strokeWidth={2} aria-hidden="true" />
                            Host pending
                        </span>
                    ) : canNominate ? (
                        <button type="button" className={bz.act} disabled={pending} onClick={onNominate}>
                            <Flag {...ic} />
                            Nominate host
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={cx(bz.act, bz.actInk, bz.actDanger)}
                        disabled={pending}
                        onClick={onRemove}
                        aria-pressed={armed === 'remove'}
                    >
                        <UserMinus {...ic} />
                        {armed === 'remove' ? `Tap again to remove ${who}` : 'Remove'}
                    </button>
                </div>
            </td>
        </tr>
    );
}
