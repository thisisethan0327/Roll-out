/**
 * "ACT AS @slug" panel on /admin/events/[id] — the sub-sidebar into the shop
 * console. Server component; links only. The slug and enabled-module list come
 * from the service-role loaders in data.ts (never the URL), and the shop
 * console re-authorizes every request server-side (requireShopMember admits
 * platform admins and flags the session as viaPlatformAdmin).
 */
import Link from 'next/link';
import { SHOP_NAV, SHOP_NAV_SECTIONS } from '@/lib/shop-nav';

const BOX: React.CSSProperties = {
    border: '1px solid var(--gold)',
    background: 'var(--gold-glow)',
    position: 'sticky',
    top: 16,
};

const LINK_STYLE: React.CSSProperties = { textDecoration: 'none' };

export function ShopConsolePanel({
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
        <aside style={BOX} aria-label="Shop console">
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 9,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--gold)',
                    }}
                >
                    SHOP CONSOLE · ACT AS @{slug.toUpperCase()}
                </div>
                <div style={{ marginTop: 6, fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                    {shopName}
                </div>
                {shopStatus && shopStatus !== 'verified' ? (
                    <div style={{ marginTop: 6 }}>
                        <span className="admin-pill warn">{shopStatus.toUpperCase()}</span>
                    </div>
                ) : null}
            </div>

            <Link
                href={`/shop/${slug}/events/${eventId}`}
                className="admin-sidebar-link active"
                style={LINK_STYLE}
            >
                THIS EVENT ›
            </Link>

            {SHOP_NAV_SECTIONS.map((sec) => {
                const rows = items.filter((n) => n.section === sec);
                if (rows.length === 0) return null;
                return (
                    <div key={sec}>
                        <div className="admin-sidebar-section">{sec}</div>
                        {rows.map((n) => (
                            <Link
                                key={n.href}
                                href={`/shop/${slug}/${n.href}`}
                                className="admin-sidebar-link"
                                style={LINK_STYLE}
                            >
                                {n.label}
                            </Link>
                        ))}
                    </div>
                );
            })}

            <div style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}>
                <Link href={`/admin/shops/${shopId}`} className="admin-sidebar-link" style={LINK_STYLE}>
                    ADMIN SHOP PAGE ›
                </Link>
            </div>
        </aside>
    );
}
