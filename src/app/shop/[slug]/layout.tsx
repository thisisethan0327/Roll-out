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
import {
    enabledModules,
    ModuleKey,
    type ModuleOverrides,
} from '@/lib/shop-modules';
import { ShopSidebar } from './ShopSidebar';

const ACTIVE_SHOP_COOKIE = 'rollout_active_shop';

/**
 * Load the pieces that drive sidebar module visibility in one shop-row read:
 *   • tier + overrides → the tier module gate (shop-modules.ts)
 *   • showProducts     → the PRODUCTS data-precondition (kept, layered on top)
 * Orders' precondition (a resolved Medusa vendor key) is fetched separately by
 * the caller via getShopVendorBySlug.
 */
async function loadModuleContext(shopId: number): Promise<{
    tier: number | null;
    overrides: ModuleOverrides;
    showProducts: boolean;
}> {
    const admin = getSupabaseAdmin();
    const { data: shopRow } = await admin
        .from('shops')
        .select('sells_products, medusa_category_handles, commerce_tier, module_overrides')
        .eq('id', shopId)
        .maybeSingle();
    const row = shopRow as any;
    const handles = row?.medusa_category_handles;
    let showProducts =
        !!row?.sells_products || (Array.isArray(handles) && handles.length > 0);
    if (!showProducts) {
        const pub = getSupabasePublicAdmin();
        const { count } = await pub
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', shopId);
        showProducts = (count ?? 0) > 0;
    }
    return {
        tier: row?.commerce_tier ?? null,
        overrides: (row?.module_overrides ?? {}) as ModuleOverrides,
        showProducts,
    };
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
    const { tier, overrides, showProducts } = await loadModuleContext(shop.shopId);
    // Orders section is gated on the shop resolving to a Medusa vendor key
    // (NeferStock, divine). Catalog-less shops (EMWRAPS) get no vendor → no link.
    const showOrders = (await getShopVendorBySlug(slug)) !== null;

    // Tier module gate ± per-shop overrides, then layer the data-precondition
    // refinements on top: a module is visible only when the tier grants it AND
    // its precondition (if any) is met. Products/Orders keep their existing
    // data gates; everything else is pure tier/override. (Route guards in each
    // gated section enforce the same resolver server-side — see shop-modules.ts.)
    const enabled = enabledModules(tier, overrides);
    if (!showProducts) enabled.delete(ModuleKey.Products);
    if (!showOrders) enabled.delete(ModuleKey.Orders);
    const enabledList = [...enabled];

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

    // Stamp the console theme server-side from the cookie so the first paint is
    // already correct (no flash-of-wrong-theme). Dark is the default; only an
    // explicit 'light' cookie flips it. The attribute lives solely on this
    // wrapper, so the scoped light tokens never leak outside /shop/*.
    const shopTheme =
        cookieStore.get('rollout_shop_theme')?.value === 'light' ? 'light' : 'dark';

    return (
        <div className="shop-layout" data-theme={shopTheme}>
            <ShopSidebar
                slug={shop.slug}
                shopName={shop.name}
                callerHandle={profile.handle}
                callerRole={role}
                callerEmail={profile.email}
                enabledModules={enabledList}
            />
            <div className="admin-main">{children}</div>
        </div>
    );
}
