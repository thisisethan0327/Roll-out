/**
 * Sub-sidebar for /admin/events/[id] (rendered by AdminShell next to the main
 * admin sidebar). Server component, links only. The slug/handle and the
 * enabled-module list come from the service-role loaders in data.ts (never the
 * URL), and the shop console re-authorizes every request server-side
 * (requireShopMember admits platform admins and flags viaPlatformAdmin).
 */
import Link from 'next/link';
import { SHOP_NAV, SHOP_NAV_SECTIONS } from '@/lib/shop-nav';

export function ShopEventSubnav({
    slug,
    shopName,
    shopId,
    shopStatus,
    eventId,
    enabled,
}: {
    slug: string;
    shopName: string;
    shopId: number;
    shopStatus: string | null;
    eventId: string;
    enabled: string[];
}) {
    const on = new Set(enabled);
    const items = SHOP_NAV.filter((n) => on.has(n.module));
    return (
        <>
            <div className="admin-subnav-head">
                <div className="admin-subnav-eyebrow">ACTING AS @{slug.toUpperCase()}</div>
                <div className="admin-subnav-title">{shopName}</div>
                {shopStatus && shopStatus !== 'verified' ? (
                    <div style={{ marginTop: 6 }}>
                        <span className="admin-pill warn">{shopStatus.toUpperCase()}</span>
                    </div>
                ) : null}
            </div>

            <div className="admin-subnav-group">
                <Link href={`/admin/events/${eventId}`} className="admin-sidebar-link active" aria-current="page">
                    <span>THIS EVENT · ADMIN VIEW</span>
                </Link>
                <Link href={`/shop/${slug}/events/${eventId}`} className="admin-sidebar-link">
                    <span>EDIT EVENT ›</span>
                </Link>
            </div>

            {SHOP_NAV_SECTIONS.map((sec) => {
                const rows = items.filter((n) => n.section === sec);
                if (rows.length === 0) return null;
                return (
                    <div key={sec} className="admin-subnav-group">
                        <div className="admin-sidebar-section">{sec}</div>
                        {rows.map((n) => (
                            <Link key={n.href} href={`/shop/${slug}/${n.href}`} className="admin-sidebar-link">
                                <span>{n.label}</span>
                            </Link>
                        ))}
                    </div>
                );
            })}

            <div className="admin-subnav-foot">
                <Link href={`/admin/shops/${shopId}`} className="admin-sidebar-link" style={{ padding: '10px 0' }}>
                    <span>ADMIN SHOP PAGE ›</span>
                </Link>
            </div>
        </>
    );
}

export function HostEventSubnav({
    handle,
    eventId,
    showTickets,
}: {
    handle: string | null;
    eventId: string;
    showTickets: boolean;
}) {
    return (
        <>
            <div className="admin-subnav-head">
                <div className="admin-subnav-eyebrow">HOST {handle ? `@${handle.toUpperCase()}` : ''} (MEMBER)</div>
                <div className="admin-subnav-title">Member-hosted event</div>
            </div>
            <div className="admin-subnav-group">
                <Link href={`/admin/events/${eventId}`} className="admin-sidebar-link active" aria-current="page">
                    <span>THIS EVENT</span>
                </Link>
                <a href="#edit" className="admin-sidebar-link">
                    <span>EDIT</span>
                </a>
                <a href="#attendees" className="admin-sidebar-link">
                    <span>ATTENDEES</span>
                </a>
                {showTickets ? (
                    <a href="#tickets" className="admin-sidebar-link">
                        <span>TICKETS</span>
                    </a>
                ) : null}
                <Link href={`/event/${eventId}`} className="admin-sidebar-link">
                    <span>VIEW PUBLIC ›</span>
                </Link>
                {handle ? (
                    <Link href={`/admin/users?q=${encodeURIComponent(handle)}`} className="admin-sidebar-link">
                        <span>HOST IN USERS ›</span>
                    </Link>
                ) : null}
            </div>
        </>
    );
}
