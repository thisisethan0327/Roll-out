/**
 * Sub-sidebar for /admin/events/[id] (rendered by AdminShell next to the main
 * admin sidebar). Server component, links only. The slug/handle and the
 * enabled-module list come from the service-role loaders in data.ts (never the
 * URL), and the shop console re-authorizes every request server-side
 * (requireShopMember admits platform admins and flags viaPlatformAdmin).
 */
import Link from 'next/link';
import { SHOP_NAV, SHOP_NAV_SECTIONS } from '@/lib/shop-nav';
import { ArrowUpRight, CalendarDays, ChevronRight, Pencil, Store, UserRound, Users, Eye, Ticket } from 'lucide-react';
import { adminStyles as a, sentence } from '@/components/glide-admin/parts';

const ic = { size: 18, strokeWidth: 1.9, 'aria-hidden': true } as const;

export function ShopEventSubnav({
    slug,
    shopName,
    shopId,
    shopStatus,
    eventId,
    enabled,
    adminOnly = [],
}: {
    slug: string;
    shopName: string;
    shopId: number;
    shopStatus: string | null;
    eventId: string;
    enabled: string[];
    /** Modules shown only because the caller is a platform admin (tier hides them). */
    adminOnly?: string[];
}) {
    const on = new Set(enabled);
    const adminOnlySet = new Set(adminOnly);
    const items = SHOP_NAV.filter((n) => on.has(n.module));
    return (
        <>
            <div className={a.subHead}>
                <div className={a.subKicker}>
                    <Store size={15} strokeWidth={2} aria-hidden="true" />
                    Acting as @{slug}
                </div>
                <div className={a.subTitle}>{shopName}</div>
                {shopStatus && shopStatus !== 'verified' ? (
                    <div className={a.chipRow} style={{ marginTop: 8 }}>
                        <span className="admin-pill warn">{sentence(shopStatus)}</span>
                    </div>
                ) : null}
            </div>

            <div className={a.subGroup}>
                <Link href={`/admin/events/${eventId}`} className={a.navLink} aria-current="page">
                    <CalendarDays {...ic} />
                    <span className={a.navLabel}>This event, admin view</span>
                </Link>
                <Link href={`/shop/${slug}/events/${eventId}`} className={a.navLink}>
                    <Pencil {...ic} />
                    <span className={a.navLabel}>Edit event</span>
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                </Link>
            </div>

            {SHOP_NAV_SECTIONS.map((sec) => {
                const rows = items.filter((n) => n.section === sec);
                if (rows.length === 0) return null;
                return (
                    <div key={sec} className={a.subGroup}>
                        <div className={a.navSec}>{sentence(sec)}</div>
                        {rows.map((n) => (
                            <Link key={n.href} href={`/shop/${slug}/${n.href}`} className={a.navLink}>
                                <span className={a.navLabel}>{sentence(n.label)}</span>
                                {adminOnlySet.has(n.module) ? (
                                    <span
                                        className={a.adminTag}
                                        title="Hidden for this shop's tier; shown because you are a Rollout admin"
                                    >
                                        Admin
                                    </span>
                                ) : null}
                            </Link>
                        ))}
                    </div>
                );
            })}

            <div className={a.subFoot}>
                <Link href={`/admin/shops/${shopId}`} className={a.navLink}>
                    <Store {...ic} />
                    <span className={a.navLabel}>Admin shop page</span>
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
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
            <div className={a.subHead}>
                <div className={a.subKicker}>
                    <UserRound size={15} strokeWidth={2} aria-hidden="true" />
                    Host {handle ? `@${handle}` : ''} (member)
                </div>
                <div className={a.subTitle}>Member-hosted event</div>
            </div>
            <div className={a.subGroup}>
                <Link href={`/admin/events/${eventId}`} className={a.navLink} aria-current="page">
                    <CalendarDays {...ic} />
                    <span className={a.navLabel}>This event</span>
                </Link>
                <a href="#edit" className={a.navLink}>
                    <Pencil {...ic} />
                    <span className={a.navLabel}>Edit</span>
                </a>
                <a href="#attendees" className={a.navLink}>
                    <Users {...ic} />
                    <span className={a.navLabel}>Attendees</span>
                </a>
                {showTickets ? (
                    <a href="#tickets" className={a.navLink}>
                        <Ticket {...ic} />
                        <span className={a.navLabel}>Tickets</span>
                    </a>
                ) : null}
                <Link href={`/event/${eventId}`} className={a.navLink}>
                    <Eye {...ic} />
                    <span className={a.navLabel}>View public page</span>
                    <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
                </Link>
                {handle ? (
                    <Link href={`/admin/users?q=${encodeURIComponent(handle)}`} className={a.navLink}>
                        <UserRound {...ic} />
                        <span className={a.navLabel}>Host in Users</span>
                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </Link>
                ) : null}
            </div>
        </>
    );
}
