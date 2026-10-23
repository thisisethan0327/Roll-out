import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { RevokeButton } from './RevokeButton';
import { TriangleAlert } from 'lucide-react';
import { AdminHead, SectionHead, adminStyles as st } from '@/components/glide-admin/parts';

export const metadata = { title: 'Permissions' };

/**
 * Both tables carry TWO foreign keys to profiles — `profile_id` (the grantee)
 * and `granted_by` (who granted it) — so a bare `profiles!inner(...)` embed is
 * ambiguous and PostgREST refuses it (PGRST201). The embed MUST name the
 * constraint. It is spelled out here because the failure is silent and the
 * page it breaks is the one that answers "who has god mode".
 *
 * Errors are surfaced, not swallowed. This page previously discarded them and
 * fell back to `[]`, so a failed query rendered "0 GRANTED · NONE" — a
 * permissions page that under-reports access is worse than one that errors,
 * because nobody goes looking.
 */
async function loadPermissions() {
    const admin = getSupabaseAdmin();
    const [padminRes, coordRes] = await Promise.all([
        admin
            .from('platform_admins')
            .select(
                'profile_id, granted_at, notes, profiles!platform_admins_profile_id_fkey!inner(id, handle, display_name)',
            )
            .order('granted_at', { ascending: false }),
        admin
            .from('meet_coordinators')
            .select(
                'profile_id, granted_at, notes, profiles!meet_coordinators_profile_id_fkey!inner(id, handle, display_name)',
            )
            .order('granted_at', { ascending: false }),
    ]);

    if (padminRes.error) {
        console.error('[admin/permissions] platform_admins load failed:', padminRes.error.message);
    }
    if (coordRes.error) {
        console.error('[admin/permissions] meet_coordinators load failed:', coordRes.error.message);
    }

    return {
        platformAdmins: padminRes.data ?? [],
        meetCoordinators: coordRes.data ?? [],
        failed: Boolean(padminRes.error || coordRes.error),
    };
}

export default async function PermissionsPage() {
    const { profile: me } = await requirePlatformAdmin();
    const { platformAdmins, meetCoordinators, failed } = await loadPermissions();

    return (
        <>
            <AdminHead title="Permissions" sub="Platform-wide role grants. Add them from the Users table." />
            {failed && (
                <div className="admin-login-error" role="alert">
                    <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
                    Could not read the grants. The counts below are not trustworthy.
                </div>
            )}

            <SectionHead title="Platform admins" sub={`${platformAdmins.length} granted. God mode.`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Handle</th>
                            <th>Name</th>
                            <th>Granted</th>
                            <th>Notes</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {platformAdmins.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">No platform admins.</div>
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
                                    <td className={st.time}>{new Date(a.granted_at).toISOString().slice(0, 10)}</td>
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

            <SectionHead
                title="Meet coordinators"
                sub={`${meetCoordinators.length} invited. They can host community meets.`}
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Handle</th>
                            <th>Name</th>
                            <th>Granted</th>
                            <th>Notes</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {meetCoordinators.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">No meet coordinators.</div>
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
                                    <td className={st.time}>{new Date(c.granted_at).toISOString().slice(0, 10)}</td>
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
