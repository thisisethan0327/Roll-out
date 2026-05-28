import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ShopRow } from './ShopRow';

export const metadata = { title: 'Shops' };

async function listShops() {
    const admin = getSupabaseAdmin();
    const { data: shops } = await admin
        .from('shops')
        .select('id, slug, name, region, created_at')
        .order('id', { ascending: true });

    const shopIds = (shops ?? []).map((s: any) => s.id);

    const [pages, memberCounts] = await Promise.all([
        admin
            .from('profiles')
            .select('id, handle, display_name, is_verified, shop_id')
            .eq('kind', 'shop_page')
            .in('shop_id', shopIds),
        admin
            .from('shop_memberships')
            .select('shop_id, role')
            .in('shop_id', shopIds),
    ]);

    const pageByShop = new Map<number, any>();
    for (const p of pages.data ?? []) pageByShop.set((p as any).shop_id, p);

    const countByShop = new Map<number, number>();
    for (const m of memberCounts.data ?? []) {
        const sid = (m as any).shop_id;
        countByShop.set(sid, (countByShop.get(sid) ?? 0) + 1);
    }

    return (shops ?? []).map((s: any) => ({
        ...s,
        page: pageByShop.get(s.id),
        memberCount: countByShop.get(s.id) ?? 0,
    }));
}

export default async function ShopsPage() {
    const shops = await listShops();
    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">SHOPS</div>
                    <div className="admin-page-sub">
                        {shops.length} TOTAL · MANAGE PAGE PROFILES + STAFF
                    </div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>SLUG</th>
                            <th>NAME</th>
                            <th>PAGE PROFILE</th>
                            <th>STAFF</th>
                            <th>VERIFIED</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shops.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">NO SHOPS YET</div>
                                </td>
                            </tr>
                        ) : (
                            shops.map((s: any) => <ShopRow key={s.id} shop={s} />)
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
