import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { StaffRow } from './StaffRow';
import { InviteStaffForm } from './InviteStaffForm';

export const metadata = { title: 'Staff' };

const ROLE_RANK: Record<string, number> = {
    owner: 5,
    admin: 4,
    manager: 3,
    installer: 2,
    staff: 1,
};

async function loadStaff(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shop_memberships')
        .select(
            'profile_id, role, created_at, profiles!inner(id, handle, display_name)',
        )
        .eq('shop_id', shopId);
    const rows = (data ?? []) as any[];
    rows.sort(
        (a, b) =>
            (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0) ||
            (a.profiles?.handle ?? '').localeCompare(b.profiles?.handle ?? ''),
    );
    return rows;
}

export default async function StaffPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { role, shop } = await requireShopMemberBySlug(slug);
    if (role !== 'owner') {
        redirect(`/shop/${slug}/overview?error=owner_only`);
    }

    const memberships = await loadStaff(shop.shopId);
    const total = memberships.length;
    const owners = memberships.filter((m) => m.role === 'owner').length;
    const managers = memberships.filter(
        (m) => m.role === 'manager' || m.role === 'admin',
    ).length;
    const installers = memberships.filter(
        (m) => m.role === 'installer',
    ).length;

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">STAFF</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · MEMBERSHIP CONTROL
                    </div>
                </div>
            </div>

            <div className="admin-stat-grid">
                <div className="admin-stat">
                    <div className="admin-stat-lbl">TOTAL STAFF</div>
                    <div className="admin-stat-num">{total}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">OWNERS</div>
                    <div className="admin-stat-num gold">{owners}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">MANAGERS</div>
                    <div className="admin-stat-num">{managers}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">INSTALLERS</div>
                    <div className="admin-stat-num">{installers}</div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>HANDLE</th>
                            <th>NAME</th>
                            <th>ROLE</th>
                            <th>JOINED</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memberships.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">
                                        NO STAFF YET — INVITE BELOW.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            memberships.map((m: any) => (
                                <StaffRow
                                    key={m.profile_id}
                                    m={m}
                                    shopId={shop.shopId}
                                    slug={slug}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <InviteStaffForm shopId={shop.shopId} slug={slug} />
        </>
    );
}
