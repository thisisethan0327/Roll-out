import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { StaffRow } from './StaffRow';
import { InviteStaffForm } from './InviteStaffForm';
import { Users } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, CountStrip } from '@/components/glide-shopbiz/parts';
import { ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

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
    const { data, error } = await admin
        .from('shop_memberships')
        .select(
            'profile_id, role, created_at, profiles!inner(id, handle, display_name, kind, host_status)',
        )
        .eq('shop_id', shopId);
    if (error) console.error('[shop/staff] loadStaff failed:', error.message);
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
        <BizPage slug={slug}>
            <ConsoleHead title="Staff" sub={`${shop.name} · Membership control`} />

            <CountStrip
                label="Staff totals"
                items={[
                    { label: 'Total staff', value: total },
                    { label: 'Owners', value: owners },
                    { label: 'Managers', value: managers },
                    { label: 'Installers', value: installers },
                ]}
            />

            <section className="g-card" aria-label="Staff">
                    {memberships.length === 0 ? (
                        <CardEmpty
                            icon={<Users size={22} strokeWidth={1.75} />}
                            title="No staff yet"
                        />
                    ) : (
                        <div className={cs.tblWrap}>
                            <table className={cs.tbl}>
                                <thead>
                                    <tr>
                                        <th scope="col">Member</th>
                                        <th scope="col">Role</th>
                                        <th scope="col" className={cs.mHide}>
                                            Joined
                                        </th>
                                        <th scope="col">
                                            <span className="g-sr">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {memberships.map((m: any) => (
                                        <StaffRow key={m.profile_id} m={m} shopId={shop.shopId} slug={slug} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </section>

            <InviteStaffForm shopId={shop.shopId} slug={slug} />
        </BizPage>
    );
}
