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
    adminOnlyModules = [],
    showSellOnNeferstock = true,
    showSwitchShop = true,
    switchShopHref = '/shop/picker',
    variant = 'main',
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
    /** Modules shown ONLY because the caller is a platform admin (the shop's tier
     *  would hide them). Tagged ADMIN in the nav. Set server-side by the layout. */
    adminOnlyModules?: string[];
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
    /** 'main' is the shop's own sidebar. 'sub' is the sub-sidebar the layout
     *  renders next to the admin sidebar when a platform admin acts in a shop
     *  they are not staff of (chosen server-side from requireShopMember's
     *  viaPlatformAdmin, never from a query param or cookie). It keeps the nav
     *  and active highlighting but drops sign-out and SWITCH SHOP -- the admin
     *  sidebar beside it owns those. */
    variant?: 'main' | 'sub';
    /** The shop's status; shown as a pill in the sub header when not verified. */
    shopStatus?: string;
}) {
    const pathname = usePathname() || '';
    const router = useRouter();
    const rank = RANK[callerRole] ?? 0;
    const enabled = new Set(enabledModules);
    const adminOnly = new Set(adminOnlyModules);

    const signOut = async () => {
        const supabase = getSupabaseBrowser();
        // Global by design (Ethan, 2026-09-08): one account across rollout.club, EMWRAPS,
        // NeferStock and UNITY, so signing out here signs out everywhere. Never 'local'.
        await supabase.auth.signOut({ scope: 'global' });
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

    const sub = variant === 'sub';
    const Root = sub ? 'div' : 'aside';

    return (
        <Root className={sub ? 'shop-subnav' : 'shop-sidebar'}>
            {sub ? (
                <div className="admin-subnav-head">
                    <div className="admin-subnav-eyebrow">ACTING AS @{slug.toUpperCase()}</div>
                    <div className="admin-subnav-title">{shopName}</div>
                    {shopStatus !== 'verified' ? (
                        <div style={{ marginTop: 6 }}>
                            <span className="admin-pill warn">{shopStatus.toUpperCase()}</span>
                        </div>
                    ) : null}
                </div>
            ) : (
            <div className="shop-sidebar-brand">
                <div className="shop-sidebar-brand-word">{shopName.toUpperCase()}</div>
                <div className="shop-sidebar-brand-sub">@{slug} · SHOP DASHBOARD</div>
            </div>
            )}
            {sections.map((sec) => {
                const items = visible.filter((n) => n.section === sec);
                if (items.length === 0) return null;
                return (
                    <div key={sec} className="admin-subnav-group">
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
                                        {adminOnly.has(n.module) ? (
                                            <span
                                                title="Hidden for this shop's tier; shown because you are a Rollout admin"
                                                style={{
                                                    fontSize: 8,
                                                    letterSpacing: 'var(--track-wider)',
                                                    color: 'var(--text-3)',
                                                    border: '1px solid var(--line)',
                                                    padding: '1px 4px',
                                                }}
                                            >
                                                ADMIN
                                            </span>
                                        ) : null}
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
                    <div className="admin-subnav-group">
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
            {sub ? (
                <div className="admin-subnav-foot">
                    <ShopThemeToggle />
                </div>
            ) : (
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
                    <div style={{ marginTop: 6 }}>ROLE: {callerRole.toUpperCase()}</div>
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
            )}
        </Root>
    );
}
