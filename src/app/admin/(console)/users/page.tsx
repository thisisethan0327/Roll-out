import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { UserRow } from './UserRow';

export const metadata = { title: 'Users' };

async function listUsers(query?: string) {
    const admin = getSupabaseAdmin();
    let q = admin
        .from('profiles')
        .select(
            'id, handle, display_name, kind, is_verified, location, rep_tier, rep_score, created_at, shop_id',
        )
        .order('created_at', { ascending: false })
        .limit(200);
    if (query) {
        q = q.or(`handle.ilike.%${query}%,display_name.ilike.%${query}%`);
    }
    const { data } = await q;
    const profiles = data ?? [];

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
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">USERS</div>
                    <div className="admin-page-sub">
                        ALL PROFILES · {users.length} SHOWN
                    </div>
                </div>
            </div>

            <form className="admin-search" action="/admin/users">
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    className="admin-search-input"
                    placeholder="SEARCH HANDLE OR DISPLAY NAME"
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>HANDLE</th>
                            <th>NAME</th>
                            <th>KIND</th>
                            <th>FLAGS</th>
                            <th>REP</th>
                            <th>JOINED</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">NO USERS MATCH</div>
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
