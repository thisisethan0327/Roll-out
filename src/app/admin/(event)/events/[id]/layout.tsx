/**
 * /admin/events/[id] shell: [AdminSidebar][event sub-sidebar][content].
 *
 * Lives in its own route group, (event), so it can add the second sidebar
 * column that the (console) layout does not have. The URL is unchanged.
 * Authorization is repeated here and in the page: requirePlatformAdmin().
 */
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { AdminShell } from '@/app/admin/AdminShell';
import { HostEventSubnav, ShopEventSubnav } from './EventSubnav';
import { UUID_RE, loadEvent, loadShopConsoleContext, loadTickets } from './data';

export default async function AdminEventLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
}) {
    const { profile } = await requirePlatformAdmin();
    const { id } = await params;

    // A bad id or a missing event renders without a sub-sidebar; the page
    // itself 404s / shows EVENT NOT FOUND.
    const event = UUID_RE.test(id) ? await loadEvent(id) : null;
    if (!event) return <AdminShell adminHandle={profile.handle}>{children}</AdminShell>;

    let subnav: React.ReactNode = null;
    if (event.shop) {
        const { enabled, adminOnly } = await loadShopConsoleContext(event.shop.slug, event.shop.id);
        subnav = (
            <ShopEventSubnav
                slug={event.shop.slug}
                shopName={event.shop.name}
                shopId={event.shop.id}
                shopStatus={event.shop.status}
                eventId={event.id}
                enabled={enabled}
                adminOnly={adminOnly}
            />
        );
    } else if (event.shop_id == null) {
        const isTiered = event.rsvp_mode === 'tiered' || event.rsvp_mode === 'paid';
        const { tickets } = await loadTickets(id);
        subnav = (
            <HostEventSubnav
                handle={event.host?.handle ?? null}
                eventId={event.id}
                showTickets={tickets.length > 0 || isTiered}
            />
        );
    }
    // shop_id set but the shop row is missing: no console to link into.

    return (
        <AdminShell adminHandle={profile.handle} subnav={subnav}>
            {children}
        </AdminShell>
    );
}
