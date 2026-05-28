import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { MembershipRow } from './MembershipRow';
import { AddMembershipForm } from './AddMembershipForm';

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
            <div className="admin-empty">SHOP #{id} NOT FOUND</div>
        );
    }

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">
                        {(shop as any).name.toUpperCase()}
                    </div>
                    <div className="admin-page-sub">
                        #{(shop as any).id} · {(shop as any).slug.toUpperCase()}
                        {(shop as any).region && ` · ${(shop as any).region.toUpperCase()}`}
                    </div>
                </div>
                <a href="/admin/shops" className="admin-action-btn muted">
                    ‹ ALL SHOPS
                </a>
            </div>

            {page ? (
                <div className="admin-stat-grid">
                    <div className="admin-stat">
                        <div className="admin-stat-lbl">PAGE HANDLE</div>
                        <div className="admin-stat-num" style={{ fontSize: 16 }}>
                            @{(page as any).handle}
                        </div>
                    </div>
                    <div className="admin-stat">
                        <div className="admin-stat-lbl">DISPLAY NAME</div>
                        <div className="admin-stat-num" style={{ fontSize: 16 }}>
                            {(page as any).display_name}
                        </div>
                    </div>
                    <div className="admin-stat">
                        <div className="admin-stat-lbl">VERIFIED</div>
                        <div
                            className={`admin-stat-num ${(page as any).is_verified ? 'gold' : ''}`}
                            style={{ fontSize: 16 }}
                        >
                            {(page as any).is_verified ? '✓ YES' : 'NO'}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="admin-empty">
                    NO SHOP_PAGE PROFILE FOR THIS SHOP — POSTS AND EVENTS AS SHOP WILL FAIL.
                </div>
            )}

            <div className="admin-page-head" style={{ marginTop: 28, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>STAFF</div>
                    <div className="admin-page-sub">
                        {memberships.length} MEMBERS
                    </div>
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
                                    <div className="admin-empty">NO STAFF YET</div>
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
        </>
    );
}
