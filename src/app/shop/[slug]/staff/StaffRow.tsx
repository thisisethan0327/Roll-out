'use client';
import { useTransition } from 'react';
import { removeStaff, setStaffRole } from './actions';

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
