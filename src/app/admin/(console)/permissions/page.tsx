import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { RevokeButton } from './RevokeButton';

export const metadata = { title: 'Permissions' };

async function loadPermissions() {
    const admin = getSupabaseAdmin();
    const [{ data: padmins }, { data: coords }] = await Promise.all([
        admin
            .from('platform_admins')
            .select('profile_id, granted_at, notes, profiles!inner(id, handle, display_name)')
            .order('granted_at', { ascending: false }),
        admin
            .from('meet_coordinators')
            .select('profile_id, granted_at, notes, profiles!inner(id, handle, display_name)')
            .order('granted_at', { ascending: false }),
    ]);
    return {
        platformAdmins: padmins ?? [],
        meetCoordinators: coords ?? [],
    };
}

export default async function PermissionsPage() {
    const { profile: me } = await requirePlatformAdmin();
    const { platformAdmins, meetCoordinators } = await loadPermissions();

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">PERMISSIONS</div>
                    <div className="admin-page-sub">
                        PLATFORM-WIDE ROLE GRANTS · ADD VIA THE USERS TABLE
                    </div>
                </div>
            </div>

            <div className="admin-page-head" style={{ marginTop: 0, paddingBottom: 0, borderBottom: 'none' }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        PLATFORM ADMINS
                    </div>
                    <div className="admin-page-sub">{platformAdmins.length} GRANTED · GOD MODE</div>
                </div>
            </div>
            <div className="admin-table-wrap" style={{ marginBottom: 32 }}>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>HANDLE</th>
                            <th>NAME</th>
                            <th>GRANTED</th>
                            <th>NOTES</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {platformAdmins.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">NONE</div>
                                </td>
                            </tr>
                        ) : (
                            platformAdmins.map((a: any) => (
                                <tr key={a.profile_id}>
                                    <td>
                                        <a href={`/admin/users?q=${a.profiles.handle}`} className="text-link">
                                            @{a.profiles.handle}
                                        </a>
                                    </td>
                                    <td>{a.profiles.display_name}</td>
                                    <td>{new Date(a.granted_at).toISOString().slice(0, 10)}</td>
                                    <td className="admin-handle">{a.notes ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <RevokeButton
                                            kind="platform_admin"
                                            profileId={a.profile_id}
                                            disabled={a.profile_id === me.profileId}
                                            handle={a.profiles.handle}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="admin-page-head" style={{ marginTop: 0, paddingBottom: 0, borderBottom: 'none' }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        MEET COORDINATORS
                    </div>
                    <div className="admin-page-sub">
                        {meetCoordinators.length} INVITED · CAN HOST COMMUNITY MEETS
                    </div>
                </div>
            </div>
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>HANDLE</th>
                            <th>NAME</th>
                            <th>GRANTED</th>
                            <th>NOTES</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {meetCoordinators.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">NONE</div>
                                </td>
                            </tr>
                        ) : (
                            meetCoordinators.map((c: any) => (
                                <tr key={c.profile_id}>
                                    <td>
                                        <a href={`/admin/users?q=${c.profiles.handle}`} className="text-link">
                                            @{c.profiles.handle}
                                        </a>
                                    </td>
                                    <td>{c.profiles.display_name}</td>
                                    <td>{new Date(c.granted_at).toISOString().slice(0, 10)}</td>
                                    <td className="admin-handle">{c.notes ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <RevokeButton
                                            kind="meet_coordinator"
                                            profileId={c.profile_id}
                                            handle={c.profiles.handle}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
