import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { GeneralSettingsForm } from './GeneralSettingsForm';

export const metadata = { title: 'General Settings' };

async function loadShop(shopId: number) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('shops')
        .select('id, slug, name, region, primary_color, secondary_color, address_line, city, state_region, postal, lat, lng, show_on_map')
        .eq('id', shopId)
        .maybeSingle();
    return data as any;
}

export default async function GeneralSettingsPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { role, shop } = await requireShopMemberBySlug(slug);
    if (role !== 'owner') {
        redirect(`/shop/${slug}/overview?error=owner_only`);
    }

    const row = await loadShop(shop.shopId);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">GENERAL</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · CORE INFO
                    </div>
                </div>
            </div>

            <div className="admin-stat-grid" style={{ marginBottom: 16 }}>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">SLUG (READ-ONLY)</div>
                    <div
                        className="admin-stat-num"
                        style={{ fontSize: 16 }}
                    >
                        @{shop.slug}
                    </div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">SHOP ID</div>
                    <div
                        className="admin-stat-num"
                        style={{ fontSize: 16 }}
                    >
                        #{shop.shopId}
                    </div>
                </div>
            </div>

            <GeneralSettingsForm shopId={shop.shopId} slug={slug} row={row} />
        </>
    );
}
