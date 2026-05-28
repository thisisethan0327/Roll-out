'use client';
import { useState, useTransition } from 'react';
import { setMembershipRole } from '../actions';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

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
        <form onSubmit={submit} className="admin-form" style={{ marginTop: 24 }}>
            <div className="admin-form-label">ADD STAFF</div>
            <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="admin-form-input"
                placeholder="@handle"
                autoCapitalize="none"
                autoCorrect="off"
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
                <div className="admin-login-error" style={{ padding: 8 }}>{err}</div>
            )}
            <button type="submit" disabled={pending || !handle.trim()} className="admin-form-btn">
                {pending ? 'ADDING…' : '+ ADD'}
            </button>
        </form>
    );
}
