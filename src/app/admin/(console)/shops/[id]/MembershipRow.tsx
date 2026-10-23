'use client';
import { useTransition } from 'react';
import { removeMembership, setMembershipRole } from '../actions';
import { UserMinus } from 'lucide-react';
import { adminStyles as a, sentence } from '@/components/glide-admin/parts';

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
                    className="admin-form-input"
                    aria-label={`Role for @${p?.handle ?? 'member'}`}
                    style={{ width: 'auto', minWidth: 150, minHeight: 44 }}
                >
                    {ROLES.map((r) => (
                        <option key={r} value={r}>
                            {sentence(r)}
                        </option>
                    ))}
                </select>
            </td>
            <td className={a.time}>{new Date(m.created_at).toISOString().slice(0, 10)}</td>
            <td style={{ textAlign: 'right' }}>
                <button
                    className="admin-action-btn danger"
                    disabled={pending}
                    onClick={onRemove}
                >
                    <UserMinus size={15} strokeWidth={2} aria-hidden="true" className={a.dangerIc} /> Remove
                </button>
            </td>
        </tr>
    );
}
