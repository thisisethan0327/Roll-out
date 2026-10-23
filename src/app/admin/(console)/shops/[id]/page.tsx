import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { MembershipRow } from './MembershipRow';
import { AddMembershipForm } from './AddMembershipForm';
import { ShopProfileForm } from './ShopProfileForm';
import { Check } from 'lucide-react';
import { AdminHead, SectionHead, Stat } from '@/components/glide-admin/parts';

export const metadata = { title: 'Shop · Detail' };

async function loadShop(id: number) {
    const admin = getSupabaseAdmin();
    const [{ data: shop }, { data: page }, { data: memberships }] =
        await Promise.all([
            admin.from('shops').select('*').eq('id', id).maybeSingle(),
            admin
                .from('profiles')
                .select('id, handle, display_name, is_verified, bio, location')
                .eq('kind', 'shop_page')
                .eq('shop_id', id)
                .maybeSingle(),
            admin
                .from('shop_memberships')
                .select('profile_id, role, created_at, profiles!inner(id, handle, display_name)')
                .eq('shop_id', id)
                .order('role'),
        ]);
    return { shop, page, memberships: memberships ?? [] };
}

export default async function ShopDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const shopId = parseInt(id, 10);
    const { shop, page, memberships } = await loadShop(shopId);
    if (!shop) {
        return (
            <>
                <AdminHead title="Shop not found" back={{ href: '/admin/shops', label: 'All shops' }} />
                <div className="admin-empty">No shop has the id #{id}.</div>
            </>
        );
    }

    return (
        <>
            <AdminHead
                back={{ href: '/admin/shops', label: 'All shops' }}
                title={(shop as any).name}
                sub={
                    <>
                        #{(shop as any).id} · {(shop as any).slug}
                        {(shop as any).region && ` · ${(shop as any).region}`}
                    </>
                }
            />

            {page ? (
                <div className="admin-stat-grid">
                    <Stat label="Page handle" value={<span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 17 }}>@{(page as any).handle}</span>} />
                    <Stat label="Display name" value={<span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 17 }}>{(page as any).display_name}</span>} />
                    <Stat
                        label="Verified"
                        value={
                            (page as any).is_verified ? (
                                <span className="admin-pill gold">
                                    <Check size={15} strokeWidth={2} aria-hidden="true" /> Verified
                                </span>
                            ) : (
                                <span className="admin-pill">Not verified</span>
                            )
                        }
                    />
                </div>
            ) : (
                <div className="admin-login-error">
                    No shop_page profile for this shop. Posts and events as the shop will fail.
                </div>
            )}

            <SectionHead title="Staff" sub={`${memberships.length} members.`} />

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Handle</th>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Joined</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memberships.length === 0 ? (
                            <tr>
                                <td colSpan={5}>
                                    <div className="admin-empty">No staff yet.</div>
                                </td>
                            </tr>
                        ) : (
                            memberships.map((m: any) => (
                                <MembershipRow key={m.profile_id} m={m} shopId={shopId} />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <AddMembershipForm shopId={shopId} />

            <ShopProfileForm
                shopId={shopId}
                shop={shop}
                bio={(page as any)?.bio ?? ''}
            />
        </>
    );
}
