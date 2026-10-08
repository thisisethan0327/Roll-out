'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { LinkPending } from '@/components/feedback';
import { SHOP_NAV as NAV, SHOP_NAV_SECTIONS, SHOP_ROLE_RANK as RANK } from '@/lib/shop-nav';
import { ShopThemeToggle } from './ShopThemeToggle';

const SWITCH_SHOP_STYLE: React.CSSProperties = {
    color: 'var(--text-2)',
    fontFamily: 'var(--font-display)',
    fontSize: 10,
    letterSpacing: 'var(--track-wider)',
    textDecoration: 'none',
};

/** Compact an email for the narrow sidebar footer (keeps the domain visible). */
function truncEmail(email: string | null): string | null {
    if (!email) return null;
    if (email.length <= 24) return email;
    const [user, domain] = email.split('@');
    if (!domain) return email.slice(0, 23) + '…';
    return `${user.slice(0, 8)}…@${domain}`;
}

export function ShopSidebar({
    slug,
    shopName,
    callerHandle,
    callerRole,
    callerEmail = null,
    enabledModules = [],
    showSellOnNeferstock = true,
    showSwitchShop = true,
    switchShopHref = '/shop/picker',
    actingAsAdmin = false,
    adminHref = '/admin',
    shopStatus = 'verified',
}: {
    slug: string;
    shopName: string;
    callerHandle: string;
    callerRole: string;
    callerEmail?: string | null;
    /** Tier-resolved enabled module keys (from the shop layout). Links whose
     *  module isn't in this set are hidden; the matching routes 404. */
    enabledModules?: string[];
    /** The two links that lead OUT of this console into Rollout. Both are set
     *  false by the layout on a tenant's own admin host, where the middleware
     *  makes them dead ends; SWITCH SHOP is kept there for anyone on staff at
     *  more than one shop. Default true, so rollout.club is unchanged. */
    showSellOnNeferstock?: boolean;
    showSwitchShop?: boolean;
    /** Where SWITCH SHOP goes. Absolute (rollout.club) on a tenant host, where
     *  the picker is a platform surface the middleware won't serve; the default
     *  relative path everywhere else. */
    switchShopHref?: string;
    /** Server-derived by the layout (requireShopMember's viaPlatformAdmin) --
     *  never from a query param or cookie. Shows the GOD MODE strip + a link
     *  back to /admin and labels the role as a platform admin. */
    actingAsAdmin?: boolean;
    /** Where BACK TO ADMIN goes (the shop's admin page). */
    adminHref?: string;
    /** The shop's status; shown as a pill in the admin strip when not verified. */
    shopStatus?: string;
}) {
    const pathname = usePathname() || '';
    const router = useRouter();
    const rank = RANK[callerRole] ?? 0;
    const enabled = new Set(enabledModules);

    const signOut = async () => {
        const supabase = getSupabaseBrowser();
        await supabase.auth.signOut({ scope: 'local' });
        // Clear active-shop cookie so next sign-in re-prompts when relevant.
        document.cookie = 'rollout_active_shop=; Path=/; Max-Age=0';
        router.push('/shop/login');
        router.refresh();
    };

    const visible = NAV.filter(
        (n) =>
            (!n.minRole || rank >= RANK[n.minRole]) &&
            enabled.has(n.module),
    );
    const sections = SHOP_NAV_SECTIONS;

    return (
        <aside className="shop-sidebar">
            <div className="shop-sidebar-brand">
                <div className="shop-sidebar-brand-word">{shopName.toUpperCase()}</div>
                <div className="shop-sidebar-brand-sub">@{slug} · SHOP DASHBOARD</div>
            </div>
            {actingAsAdmin ? (
                <div className="shop-sidebar-admin">
                    <div>GOD MODE · ACTING AS @{slug.toUpperCase()}</div>
                    {shopStatus !== 'verified' ? (
                        <div style={{ marginTop: 6 }}>
                            <span className="admin-pill warn">{shopStatus.toUpperCase()}</span>
                        </div>
                    ) : null}
                    <Link href={adminHref} className="shop-sidebar-admin-back">
                        ‹ BACK TO ADMIN
                    </Link>
                </div>
            ) : null}
            {sections.map((sec) => {
                const items = visible.filter((n) => n.section === sec);
                if (items.length === 0) return null;
                return (
                    <div key={sec}>
                        <div className="admin-sidebar-section">{sec}</div>
                        {items.map((n) => {
                            const href = `/shop/${slug}/${n.href}`;
                            const active = pathname === href || pathname.startsWith(href + '/');
                            return (
                                <Link
                                    key={n.href}
                                    href={href}
                                    className={`admin-sidebar-link ${active ? 'active' : ''}`}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                        {n.label}
                                        <LinkPending />
                                    </span>
                                    {active && <span>›</span>}
                                </Link>
                            );
                        })}
                    </div>
                );
            })}
            {showSellOnNeferstock && rank >= RANK.owner ? (() => {
                const href = `/shop/${slug}/sell`;
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                    <div>
                        <div className="admin-sidebar-section">COMMERCE</div>
                        <Link href={href} className={`admin-sidebar-link ${active ? 'active' : ''}`}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                SELL ON NEFERSTOCK
                                <LinkPending />
                            </span>
                            {active && <span>›</span>}
                        </Link>
                    </div>
                );
            })() : null}
            <div className="admin-sidebar-foot">
                <Link
                    href={`/shop/${slug}/account`}
                    style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                    title="View / edit your account"
                >
                    <div>SIGNED IN AS ›</div>
                    <div style={{ color: 'var(--gold)', marginTop: 4 }}>@{callerHandle}</div>
                    {truncEmail(callerEmail) && (
                        <div
                            style={{ marginTop: 4, color: 'var(--text-3)', wordBreak: 'break-all' }}
                            title={callerEmail ?? undefined}
                        >
                            {truncEmail(callerEmail)}
                        </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                        {actingAsAdmin ? 'ROLE: PLATFORM ADMIN (AS OWNER)' : `ROLE: ${callerRole.toUpperCase()}`}
                    </div>
                </Link>
                {showSwitchShop ? (
                    <div style={{ marginTop: 10 }}>
                        {/* A cross-origin href is a real navigation off this
                            host, so it goes out as a plain anchor rather than a
                            Link the router would try to prefetch. */}
                        {switchShopHref.startsWith('http') ? (
                            <a href={switchShopHref} style={SWITCH_SHOP_STYLE}>
                                ⇄ SWITCH SHOP
                            </a>
                        ) : (
                            <Link href={switchShopHref} style={SWITCH_SHOP_STYLE}>
                                ⇄ SWITCH SHOP
                            </Link>
                        )}
                    </div>
                ) : null}
                <ShopThemeToggle />
                <button className="admin-sidebar-signout" onClick={signOut}>
                    SIGN OUT
                </button>
            </div>
        </aside>
    );
}
