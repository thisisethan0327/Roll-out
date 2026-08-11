'use client';
import { useTransition } from 'react';
import { removeStaff, setStaffRole, nominateHostAction } from './actions';

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
    const p = m.profiles;

    const onChangeRole = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const role = e.target.value as (typeof ROLES)[number];
        start(async () => {
            try {
                await setStaffRole(m.profile_id, shopId, slug, role);
            } catch (err: any) {
                alert('Failed: ' + (err?.message ?? 'unknown'));
            }
        });
    };

    const onRemove = () => {
        if (!confirm(`Remove @${p?.handle ?? 'user'} from this shop?`)) return;
        start(async () => {
            try {
                await removeStaff(m.profile_id, shopId, slug);
            } catch (err: any) {
                alert('Failed: ' + (err?.message ?? 'unknown'));
            }
        });
    };

    const hostStatus: string = p?.host_status ?? 'none';
    const canNominate = (p?.kind ?? 'user') === 'user' && hostStatus === 'none';

    const onNominate = () => {
        if (!confirm(`Nominate @${p?.handle ?? 'user'} as a host? A Rollout admin reviews it.`)) return;
        start(async () => {
            const res = await nominateHostAction(m.profile_id, shopId, slug);
            if (!res.ok) alert('Failed: ' + (res.error ?? 'unknown'));
        });
    };

    return (
        <tr>
            <td>
                <span className="admin-handle">@{p?.handle ?? '?'}</span>
            </td>
            <td>{p?.display_name ?? '—'}</td>
            <td>
                <select
                    defaultValue={m.role}
                    onChange={onChangeRole}
                    disabled={pending}
                    style={{
                        background: 'var(--bg-2)',
                        color: 'var(--text)',
                        border: '1px solid var(--line-mid)',
                        padding: '4px 8px',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    {ROLES.map((r) => (
                        <option key={r} value={r}>
                            {r.toUpperCase()}
                        </option>
                    ))}
                </select>
            </td>
            <td>
                {m.created_at
                    ? new Date(m.created_at).toISOString().slice(0, 10)
                    : '—'}
            </td>
            <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {hostStatus === 'verified' ? (
                        <span className="admin-pill neon" title="Verified individual host">HOST ✓</span>
                    ) : hostStatus === 'pending' ? (
                        <span className="admin-pill gold" title="Host nomination under review">HOST PENDING</span>
                    ) : canNominate ? (
                        <button className="admin-action-btn muted" disabled={pending} onClick={onNominate} title="Nominate as an individual host">
                            NOMINATE HOST
                        </button>
                    ) : null}
                    <button
                        className="admin-action-btn danger"
                        disabled={pending}
                        onClick={onRemove}
                    >
                        REMOVE
                    </button>
                </div>
            </td>
        </tr>
    );
}
