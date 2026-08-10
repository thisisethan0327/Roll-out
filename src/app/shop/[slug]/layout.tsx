/**
 * Per-shop layout — enforces shop membership once per navigation and renders
 * the sidebar + content shell. Every child page inherits the gate.
 *
 * Also writes the active-shop cookie so subsequent /shop visits land here by
 * default (instead of bouncing through the picker every time).
 */
import { cookies } from 'next/headers';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { getShopVendorBySlug } from '@/lib/store-shops';
import { ShopSidebar } from './ShopSidebar';

const ACTIVE_SHOP_COOKIE = 'rollout_active_shop';

/** Whether the PRODUCTS section is available for this shop. */
async function computeShowProducts(shopId: number): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const { data: shopRow } = await admin
        .from('shops')
        .select('sells_products, medusa_category_handles')
        .eq('id', shopId)
        .maybeSingle();
    const handles = (shopRow as any)?.medusa_category_handles;
    if (
        (shopRow as any)?.sells_products ||
        (Array.isArray(handles) && handles.length > 0)
    ) {
        return true;
    }
    const pub = getSupabasePublicAdmin();
    const { count } = await pub
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shopId);
    return (count ?? 0) > 0;
}

export default async function ShopLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { profile, role, shop } = await requireShopMemberBySlug(slug);
    const showProducts = await computeShowProducts(shop.shopId);
    // Orders section is gated on the shop resolving to a Medusa vendor key
    // (NeferStock, divine). Catalog-less shops (EMWRAPS) get no vendor → no link.
    const showOrders = (await getShopVendorBySlug(slug)) !== null;

    // Persist "last active shop" so /shop root → this slug next time. 30-day
    // sliding window so it expires for long-inactive users.
    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_SHOP_COOKIE)?.value !== slug) {
        try {
            cookieStore.set(ACTIVE_SHOP_COOKIE, slug, {
                path: '/',
                httpOnly: false,           // readable by client for the sidebar's switcher
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30,
            });
        } catch {
            // Server Component context can't write cookies on every render;
            // middleware refresh handles persistence for follow-up navs.
        }
    }

    return (
        <div className="shop-layout">
            <ShopSidebar
                slug={shop.slug}
                shopName={shop.name}
                callerHandle={profile.handle}
                callerRole={role}
                showProducts={showProducts}
                showOrders={showOrders}
            />
            <div className="admin-main">{children}</div>
        </div>
    );
}
