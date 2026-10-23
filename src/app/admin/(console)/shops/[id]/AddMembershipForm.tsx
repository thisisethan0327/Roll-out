'use client';
import { useState, useTransition } from 'react';
import { setMembershipRole } from '../actions';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { UserPlus } from 'lucide-react';
import { adminStyles as a, sentence } from '@/components/glide-admin/parts';

const ROLES = ['owner', 'admin', 'manager', 'installer', 'staff'] as const;

export function AddMembershipForm({ shopId }: { shopId: number }) {
    const [handle, setHandle] = useState('');
    const [role, setRole] = useState<(typeof ROLES)[number]>('installer');
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        const target = handle.trim().toLowerCase().replace(/^@/, '');
        if (!target) return;
        start(async () => {
            try {
                const supabase = getSupabaseBrowser();
                const { data: prof, error } = await supabase
                    .from('profiles')
                    .select('id, handle')
                    .eq('handle', target)
                    .maybeSingle();
                if (error) throw error;
                if (!prof) {
                    setErr(`No profile matches @${target}`);
                    return;
                }
                await setMembershipRole((prof as any).id, shopId, role);
                setHandle('');
            } catch (e: any) {
                setErr(e?.message ?? 'Failed to add member');
            }
        });
    };

    return (
        <form onSubmit={submit} className="admin-form" aria-labelledby={`add-staff-${shopId}`}>
            <h2 className={a.formTitle} id={`add-staff-${shopId}`}>
                Add staff
            </h2>
            <div className={a.fieldRow}>
                <label className={a.field}>
                    <span className="admin-form-label">Member handle</span>
                    <input
                        type="text"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        className="admin-form-input"
                        placeholder="@handle"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                </label>
                <label className={a.field}>
                    <span className="admin-form-label">Role</span>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                        className="admin-form-input"
                    >
                        {ROLES.map((r) => (
                            <option key={r} value={r}>
                                {sentence(r)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {err && (
                <div className="admin-login-error" role="alert">
                    {err}
                </div>
            )}
            <button type="submit" disabled={pending || !handle.trim()} className="admin-action-btn">
                <UserPlus size={16} strokeWidth={2} aria-hidden="true" />
                {pending ? 'Adding…' : 'Add to staff'}
            </button>
        </form>
    );
}
