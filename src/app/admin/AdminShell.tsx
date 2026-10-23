/**
 * Shared platform-admin shell: [AdminSidebar][optional sub-sidebar][content].
 *
 * Used by the (console) layout (no subnav — output identical to before), by the
 * /admin/events/[id] layout (event sub-sidebar), and by /shop/[slug] when a
 * platform admin is acting in a shop they are not staff of (ShopSidebar as the
 * sub-sidebar). The CALLER must already have authorized the viewer
 * (requirePlatformAdmin / requireShopMember) — this component renders chrome
 * only and trusts nothing from the client.
 */
import { getAttentionCount, getPendingAppealsCount, getPendingReportsCount } from '@/lib/admin-attention';
import { AdminSidebar } from './AdminSidebar';
import { JumpBar } from './JumpBar';
import { AdminNav } from '@/components/glide-admin/AdminNav';
import s from '@/components/glide-admin/admin.module.css';

export async function AdminShell({
    adminHandle,
    subnav,
    layoutClass = 'admin-layout',
    dataTheme,
    prelude,
    banner,
    children,
}: {
    adminHandle: string;
    /** Second sidebar column, flush against the main one. */
    subnav?: React.ReactNode;
    /** Root class. The shop console passes 'shop-layout' to keep its scoped theme tokens. */
    layoutClass?: 'admin-layout' | 'shop-layout';
    dataTheme?: 'light' | 'dark';
    /** Non-visual nodes rendered first inside the root (tenant <style>, guards). */
    prelude?: React.ReactNode;
    /** Rendered at the top of the content column, above the page. */
    banner?: React.ReactNode;
    children: React.ReactNode;
}) {
    const [attentionCount, reportsCount, appealsCount] = await Promise.all([
        getAttentionCount(),
        getPendingReportsCount(),
        getPendingAppealsCount(),
    ]);
    // Glide (web phase 3, admin lane): the platform-admin console renders in the
    // Glide shell. So does the shop console's admin path (layoutClass
    // 'shop-layout', an admin acting as a shop): the shop pages inside it are
    // Glide, and the legacy chrome around them read as a second product (and
    // its dark sub-column hid the light-mode shop nav). The legacy branch below
    // stays as the fallback for any other caller.
    if (layoutClass === 'admin-layout' || layoutClass === 'shop-layout') {
        return (
            <div
                className={`glide glide-page ${s.shell}${subnav ? ` ${s.hasSub}` : ''}${
                    layoutClass === 'shop-layout' ? ` ${s.shopSub}` : ''
                }`}
            >
                {prelude}
                <AdminNav
                    adminLabel={`@${adminHandle}`}
                    attentionCount={attentionCount}
                    reportsCount={reportsCount}
                    appealsCount={appealsCount}
                />
                {subnav ? (
                    <nav className={s.subnav} aria-label="Section navigation">
                        <div className={s.subnavIn}>{subnav}</div>
                    </nav>
                ) : null}
                <div className={s.main}>
                    <div className={s.header}>
                        <JumpBar glide />
                    </div>
                    {banner}
                    <main className={s.page}>{children}</main>
                </div>
            </div>
        );
    }
    return (
        <div
            className={`${layoutClass}${subnav ? ' has-subnav' : ''}`}
            {...(dataTheme ? { 'data-theme': dataTheme } : {})}
        >
            {prelude}
            <AdminSidebar
                adminLabel={`@${adminHandle}`}
                attentionCount={attentionCount}
                reportsCount={reportsCount}
                appealsCount={appealsCount}
            />
            {subnav ? (
                <nav className="admin-subnav" aria-label="Section navigation">
                    <div className="admin-subnav-inner">{subnav}</div>
                </nav>
            ) : null}
            <div className="admin-main">
                <div className="admin-header">
                    <JumpBar />
                </div>
                {banner}
                {children}
            </div>
        </div>
    );
}
