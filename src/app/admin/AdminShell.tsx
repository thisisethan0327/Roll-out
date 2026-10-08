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
import { getAttentionCount, getPendingReportsCount } from '@/lib/admin-attention';
import { AdminSidebar } from './AdminSidebar';
import { JumpBar } from './JumpBar';

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
    const [attentionCount, reportsCount] = await Promise.all([
        getAttentionCount(),
        getPendingReportsCount(),
    ]);
    return (
        <div
            className={`${layoutClass}${subnav ? ' has-subnav' : ''}`}
            {...(dataTheme ? { 'data-theme': dataTheme } : {})}
        >
            {prelude}
            <AdminSidebar adminLabel={`@${adminHandle}`} attentionCount={attentionCount} reportsCount={reportsCount} />
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
