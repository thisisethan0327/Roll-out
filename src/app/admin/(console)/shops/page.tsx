import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ShopRow } from './ShopRow';
import { AdminHead } from '@/components/glide-admin/parts';

export const metadata = { title: 'Shops' };

async function listShops() {
    const admin = getSupabaseAdmin();
    const { data: shops, error } = await admin
        .from('shops')
        .select('id, slug, name, region, created_at, lat, show_on_map')
        .order('id', { ascending: true });
    if (error) console.error('[admin/shops] load failed:', error.message);

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
            <AdminHead title="Shops" sub={`${shops.length} total`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Slug</th>
                            <th>Name</th>
                            <th>Page profile</th>
                            <th>Staff</th>
                            <th>Verified</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shops.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="admin-empty">No shops yet.</div>
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
