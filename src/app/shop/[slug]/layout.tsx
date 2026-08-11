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
    status: string;
    reviewNote: string | null;
}> {
    const admin = getSupabaseAdmin();
    const { data: shopRow } = await admin
        .from('shops')
        .select('sells_products, medusa_category_handles, commerce_tier, module_overrides, status, review_note')
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
        status: (row?.status ?? 'pending') as string,
        reviewNote: (row?.review_note ?? null) as string | null,
    };
}

/**
 * Gate screen for a shop that is not yet verified. Renders instead of the full
 * console — no operational tabs — until a platform admin approves the listing.
 */
function ShopPendingGate({
    shopName,
    status,
    reviewNote,
}: {
    shopName: string;
    status: string;
    reviewNote: string | null;
}) {
    const copy =
        status === 'rejected'
            ? {
                  eyebrow: '／ APPLICATION NOT APPROVED',
                  title: 'This shop was not approved',
                  body: 'Your Rollout listing application was declined. If you think this is a mistake, reply to the email we sent or reach out to support.',
              }
            : status === 'suspended'
              ? {
                    eyebrow: '／ SHOP SUSPENDED',
                    title: 'This shop is suspended',
                    body: 'Your shop is currently suspended and hidden from Rollout. Contact support to resolve it.',
                }
              : {
                    eyebrow: '／ UNDER REVIEW',
                    title: 'Your shop is pending verification',
                    body: 'Thanks for applying. A Rollout admin is reviewing your shop. Once verified it goes live on the directory and map, and your console unlocks. We’ll email you the moment it’s approved.',
                };
    return (
        <div className="shop-layout" data-theme="dark">
            <div className="admin-main" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <div className="feature-card corner-wrap" style={{ maxWidth: 560, width: '100%', padding: '40px 32px', textAlign: 'center' }}>
                    <span className="corner-bottom-left" />
                    <span className="corner-bottom-right" />
                    <div className="eyebrow eyebrow-gold mb-4">{copy.eyebrow}</div>
                    <h1 style={{ fontSize: 26, letterSpacing: 0.5, margin: '0 0 8px' }}>{copy.title}</h1>
                    <div className="mono-row" style={{ justifyContent: 'center', fontSize: 12, marginBottom: 18 }}>
                        <span className="accent">{(shopName || 'SHOP').toUpperCase()}</span>
                        <span className="sep" />
                        <span>{status.toUpperCase()}</span>
                    </div>
                    <p style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>{copy.body}</p>
                    {reviewNote && (status === 'rejected' || status === 'suspended') ? (
                        <p style={{ color: 'var(--text-2)', fontSize: 13, fontStyle: 'italic', margin: '0 0 20px' }}>
                            Note from review: &ldquo;{reviewNote}&rdquo;
                        </p>
                    ) : null}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <a href="/shop/picker" className="btn btn-ghost">Switch shop</a>
                        <a href="/" className="btn btn-ghost">Back to Rollout</a>
                    </div>
                </div>
            </div>
        </div>
    );
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
    const { tier, overrides, showProducts, status, reviewNote } = await loadModuleContext(shop.shopId);

    // Not-yet-verified shops get the pending gate — no operational console until
    // a platform admin approves the listing. (Platform admins reviewing the shop
    // still use /admin/verifications, not this console.)
    if (status !== 'verified') {
        return <ShopPendingGate shopName={shop.name} status={status} reviewNote={reviewNote} />;
    }
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
