import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { UserRow } from './UserRow';
import { selectWithBan } from '@/lib/ban-server';
import { Search } from 'lucide-react';
import { AdminHead } from '@/components/glide-admin/parts';

export const metadata = { title: 'Users' };

async function listUsers(query?: string) {
    const admin = getSupabaseAdmin();
    // selectWithBan: also fetches banned_until, and quietly drops it when
    // migration 091 is not applied yet.
    const { data, error } = await selectWithBan(
        'id, handle, display_name, kind, is_verified, location, level, xp_total, created_at, shop_id',
        (cols) => {
            let q = admin.from('profiles').select(cols).order('created_at', { ascending: false }).limit(200);
            if (query) {
                q = q.or(`handle.ilike.%${query}%,display_name.ilike.%${query}%`);
            }
            return q;
        },
    );
    if (error) console.error('[admin/users] load failed:', error.message);
    const profiles = (data ?? []) as any[];

    // Annotate with platform_admin + meet_coordinator membership in one extra
    // pass each.
    const ids = profiles.map((p: any) => p.id);
    const [{ data: padmins }, { data: coords }] = await Promise.all([
        admin.from('platform_admins').select('profile_id').in('profile_id', ids),
        admin.from('meet_coordinators').select('profile_id').in('profile_id', ids),
    ]);
    const adminSet = new Set((padmins ?? []).map((r: any) => r.profile_id));
    const coordSet = new Set((coords ?? []).map((r: any) => r.profile_id));

    return profiles.map((p: any) => ({
        ...p,
        isPlatformAdmin: adminSet.has(p.id),
        isMeetCoordinator: coordSet.has(p.id),
    }));
}

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const { profile: me } = await requirePlatformAdmin();
    const { q } = await searchParams;
    const users = await listUsers(q);

    return (
        <>
            <AdminHead title="Users" sub={`All profiles, newest first. ${users.length} shown.`} />

            <form className="admin-search" action="/admin/users">
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="Search handle or display name"
                    aria-label="Search handle or display name"
                />
                <button type="submit" className="admin-action-btn">
                    <Search size={16} strokeWidth={2} aria-hidden="true" /> Search
                </button>
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Handle</th>
                            <th>Name</th>
                            <th>Kind</th>
                            <th>Flags</th>
                            <th>Level</th>
                            <th>Joined</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">No users match that search.</div>
                                </td>
                            </tr>
                        ) : (
                            users.map((u: any) => (
                                <UserRow key={u.id} user={u} adminProfileId={me.profileId} />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
