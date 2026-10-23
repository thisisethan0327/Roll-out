/**
 * Per-shop layout — enforces shop membership once per navigation and renders
 * the sidebar + content shell. Every child page inherits the gate.
 *
 * Also writes the active-shop cookie so subsequent /shop visits land here by
 * default (instead of bouncing through the picker every time).
 */
import { cookies, headers } from 'next/headers';
import { hasMultipleShops, loadModuleContext, requireShopMemberBySlug } from '@/lib/auth-guard';
import { getShopVendorBySlug } from '@/lib/store-shops';
import { adminModuleView, enabledModules, ModuleKey } from '@/lib/shop-modules';
import { ShopSidebar } from './ShopSidebar';
import { AdminShell } from '@/app/admin/AdminShell';
import { brandForSlug, brandStyle, ROLLOUT_BRAND } from '@/lib/tenant-brand';
import { ROLLOUT_ORIGIN, tenantForHost } from '@/lib/tenant-hosts';
import { AuthHashGuard } from '@/components/auth/AuthHashGuard';
import { ArrowLeftRight, CircleX, Clock, ShieldCheck } from 'lucide-react';
import shell from '@/components/glide-shop/shell.module.css';

const ACTIVE_SHOP_COOKIE = 'rollout_active_shop';

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
                  title: 'This shop was not approved',
                  body: 'Your Rollout listing application was declined. If you think this is a mistake, reply to the email we sent or reach out to support.',
              }
            : status === 'suspended'
              ? {
                    title: 'This shop is suspended',
                    body: 'Your shop is currently suspended and hidden from Rollout. Contact support to resolve it.',
                }
              : {
                    title: 'Your shop is pending verification',
                    body: 'Thanks for applying. A Rollout admin is reviewing your shop. Once verified it goes live on the directory and map, and your console unlocks. We’ll email you the moment it’s approved.',
                };
    const Icon = status === 'rejected' || status === 'suspended' ? CircleX : Clock;
    return (
        <div className={`shop-layout glide ${shell.gate}`}>
            <main className={`g-card ${shell.gateCard}`}>
                <span className="g-ic" aria-hidden="true">
                    <Icon size={22} strokeWidth={2} />
                </span>
                <h1>{copy.title}</h1>
                <div className="g-chips" style={{ justifyContent: 'center', marginBottom: 16 }}>
                    <span className="g-chip">{shopName || 'Shop'}</span>
                    <span className="g-chip">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                </div>
                <p>{copy.body}</p>
                {reviewNote && (status === 'rejected' || status === 'suspended') ? (
                    <p>Note from review: &ldquo;{reviewNote}&rdquo;</p>
                ) : null}
                <div className={shell.gateActs}>
                    <a href="/shop/picker" className="g-sec g-sec--ink">
                        <ArrowLeftRight size={17} strokeWidth={2} aria-hidden="true" />
                        Switch shop
                    </a>
                    <a href="/" className="g-sec g-sec--ink">
                        Back to the dashboard
                    </a>
                </div>
            </main>
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
    const { profile, role, shop, viaPlatformAdmin, isPlatformAdmin } = await requireShopMemberBySlug(slug);
    const { tier, overrides, showProducts, status, reviewNote } = await loadModuleContext(shop.shopId);

    // Not-yet-verified shops get the pending gate — no operational console until
    // a platform admin approves the listing. Platform admins are let through
    // (the sidebar and the strip below show the shop's status), so they can
    // inspect and fix a pending/rejected/suspended shop.
    if (status !== 'verified' && !viaPlatformAdmin) {
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
    // Platform admins (member of this shop or not) see EVERY module, tier or
    // not; the ones the shop itself would not show get an ADMIN tag in the nav.
    // Decided server-side in requireShopMember (never a prop/param), and the
    // section route guards (requireShopModule) apply the same bypass.
    let enabledList: string[] = [...enabled];
    let adminOnlyModules: string[] = [];
    if (isPlatformAdmin) {
        const dataOff: ModuleKey[] = [];
        if (!showProducts) dataOff.push(ModuleKey.Products);
        if (!showOrders) dataOff.push(ModuleKey.Orders);
        const view = adminModuleView(enabled, dataOff);
        enabledList = view.enabled;
        adminOnlyModules = view.adminOnly;
    }

    // Persist "last active shop" so /shop root → this slug next time. 30-day
    // sliding window so it expires for long-inactive users.
    const cookieStore = await cookies();
    // An admin acting as a shop must not repoint their own default shop.
    if (!viaPlatformAdmin && cookieStore.get(ACTIVE_SHOP_COOKIE)?.value !== slug) {
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

    // The legacy console theme cookie. Glide follows the site Appearance
    // (stamped on <html>), so only the admin shell's own chrome still reads it.
    const shopTheme =
        cookieStore.get('rollout_shop_theme')?.value === 'light' ? 'light' : 'dark';

    const brand = brandForSlug(shop.slug);
    const brandCss = brandStyle(brand);
    // A tenant-branded shop shows its own name where Rollout's wordmark was, and
    // the shell hides the tricolore marks (data-tenant).
    const isTenantBrand = brand !== ROLLOUT_BRAND;

    // A tenant's own door (admin.unityusa.co) is the whole product there: the
    // middleware refuses every other path on that host, so the two sidebar
    // links that lead out of this console into Rollout are dead ends. Hidden on
    // the tenant HOST only — rollout.club/shop/<slug> keeps both, tenant accent
    // or not. SWITCH SHOP survives for anyone actually on staff at a second
    // shop, since for them it still goes somewhere they can reach.
    const onTenantHost = tenantForHost((await headers()).get('host')) !== null;
    const showSwitchShop = !onTenantHost || (await hasMultipleShops(profile.profileId));
    // Switching shops is a PLATFORM action, so on a tenant host it walks out to
    // Rollout by absolute URL rather than trying the picker behind the tenant's
    // own door -- the middleware refuses /shop/picker there, so a relative href
    // would just bounce back to the console (Ethan's call).
    const switchShopHref = onTenantHost ? `${ROLLOUT_ORIGIN}/shop/picker` : '/shop/picker';

    // Per-tenant accent. One variable override reskins buttons, active nav,
    // focus rings and eyebrows together, in both themes.
    const tenantStyle = brandCss ? <style dangerouslySetInnerHTML={{ __html: brandCss }} /> : null;

    // A platform admin acting in a shop they are NOT staff of (viaPlatformAdmin,
    // computed server-side in requireShopMember): the admin shell, so god mode
    // never disappears -- [AdminSidebar][this shop's nav as a sub-sidebar][page].
    // Not used on a tenant's own host, where the middleware refuses /admin/* and
    // the admin sidebar would be dead links; there the console renders as normal.
    if (viaPlatformAdmin && !onTenantHost) {
        return (
            <AdminShell
                adminHandle={profile.handle}
                layoutClass="shop-layout"
                dataTheme={shopTheme}
                prelude={
                    <>
                        {tenantStyle}
                        <AuthHashGuard />
                    </>
                }
                subnav={
                    <ShopSidebar
                        variant="sub"
                        slug={shop.slug}
                        shopName={shop.name}
                        callerHandle={profile.handle}
                        callerRole={role}
                        callerEmail={profile.email}
                        enabledModules={enabledList}
                        adminOnlyModules={adminOnlyModules}
                        showSellOnNeferstock
                        showSwitchShop={false}
                        shopStatus={status}
                    />
                }
                banner={null}
            >
                <div
                    className={`glide ${shell.shell} ${shell.acting}`}
                    data-tenant={isTenantBrand ? brand.house : undefined}
                >
                    <div className={shell.mainIn}>
                        <div className={shell.adminStrip} role="note">
                            <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
                            <span>
                                Admin · acting as @{shop.slug}
                                {status !== 'verified' ? ` · shop ${status}` : ''}. Every change here is made as
                                the shop.
                            </span>
                        </div>
                        {children}
                    </div>
                </div>
            </AdminShell>
        );
    }

    return (
        <div
            className={`shop-layout glide ${shell.shell}`}
            data-tenant={isTenantBrand ? brand.house : undefined}
        >
            {tenantStyle}
            {/* Strip an auth fragment wherever the broker drops somebody who was
                already signed in — they never pass the login page, so nothing
                else would. */}
            <AuthHashGuard />
            <ShopSidebar
                slug={shop.slug}
                shopName={shop.name}
                callerHandle={profile.handle}
                callerRole={role}
                callerEmail={profile.email}
                enabledModules={enabledList}
                adminOnlyModules={adminOnlyModules}
                showSellOnNeferstock={!onTenantHost}
                showSwitchShop={showSwitchShop}
                switchShopHref={switchShopHref}
                brandLabel={isTenantBrand ? brand.label : null}
            />
            <main className={shell.main}>
                <div className={shell.mainIn}>{children}</div>
            </main>
        </div>
    );
}
