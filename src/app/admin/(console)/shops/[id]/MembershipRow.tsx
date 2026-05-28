'use client';
import { useTransition } from 'react';
import { removeMembership, setMembershipRole } from '../actions';

const ROLES = ['owner', 'admin', 'manager', 'installer', 'staff'] as const;

export function MembershipRow({ m, shopId }: { m: any; shopId: number }) {
    const [pending, start] = useTransition();
    const p = m.profiles;

    const onChangeRole = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const role = e.target.value as (typeof ROLES)[number];
        start(async () => {
            try {
                await setMembershipRole(m.profile_id, shopId, role);
            } catch (err: any) {
                alert('Failed: ' + (err?.message ?? 'unknown'));
            }
        });
    };

    const onRemove = () => {
        if (!confirm(`Remove @${p?.handle ?? 'user'} from this shop?`)) return;
        start(async () => {
            try {
                await removeMembership(m.profile_id, shopId);
            } catch (err: any) {
                alert('Failed: ' + (err?.message ?? 'unknown'));
            }
        });
    };

    return (
        <tr>
            <td>
                <a href={`/admin/users?q=${p?.handle}`} className="text-link">
                    @{p?.handle ?? '?'}
                </a>
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
            <td>{new Date(m.created_at).toISOString().slice(0, 10)}</td>
            <td style={{ textAlign: 'right' }}>
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={onRemove}
                >
                    REMOVE
                </button>
            </td>
        </tr>
    );
}
