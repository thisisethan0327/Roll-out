'use client';
/**
 * Shop console navigation, in Glide (boards: G3 web host console, G5).
 *
 *   desktop  a sticky column: the console's mark, the shop card, the grouped
 *            module links (the current one a navy pill) and the footer (who is
 *            signed in, switch shop, Appearance, sign out)
 *   ≤ 900px  a top bar with the shop name and a Menu button; the same links
 *            and footer open in a bottom sheet
 *
 * The links, their order, the role and module gates, SELL ON NEFERSTOCK,
 * SWITCH SHOP and the global sign-out are exactly as before; only the look
 * changed. On a tenant's own door (brandLabel set) the Rollout wordmark is
 * replaced by the tenant's name.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import {
    ArrowLeftRight,
    CalendarDays,
    ChevronRight,
    Flag,
    IdCard,
    Inbox,
    LayoutDashboard,
    LogOut,
    Mail,
    Menu,
    MessagesSquare,
    MonitorSmartphone,
    Newspaper,
    Package,
    Settings,
    ShoppingBag,
    Star,
    Store,
    Tags,
    UserRound,
    Users,
    Wrench,
    type LucideProps,
} from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { LinkPending } from '@/components/feedback';
import { Sheet } from '@/components/glide/Sheet';
import { SHOP_NAV as NAV, SHOP_NAV_SECTIONS, SHOP_ROLE_RANK as RANK } from '@/lib/shop-nav';
import { ShopThemeToggle } from './ShopThemeToggle';
import s from '@/components/glide-shop/shell.module.css';

const ICONS: Record<string, ComponentType<LucideProps>> = {
    overview: LayoutDashboard,
    inbox: Inbox,
    messages: MessagesSquare,
    calendar: CalendarDays,
    tickets: Wrench,
    customers: Users,
    products: Package,
    orders: ShoppingBag,
    posts: Newspaper,
    events: Flag,
    'kiosk-events': MonitorSmartphone,
    reviews: Star,
    page: Store,
    account: UserRound,
    staff: IdCard,
    services: Tags,
    'settings/general': Settings,
    'settings/email': Mail,
    sell: Store,
};

/** The nav config is uppercase (shared with the admin console); Glide shows sentence case. */
function sentence(label: string): string {
    const t = label.toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Compact an email for the narrow sidebar footer (keeps the domain visible). */
function truncEmail(email: string | null): string | null {
    if (!email) return null;
    if (email.length <= 26) return email;
    const [user, domain] = email.split('@');
    if (!domain) return email.slice(0, 25) + '…';
    return `${user.slice(0, 8)}…@${domain}`;
}

function initials(handle: string): string {
    const t = handle.replace(/^@+/, '').replace(/[^a-z0-9]/gi, ' ').trim().split(/\s+/);
    return ((t[0]?.[0] ?? '?') + (t.length > 1 ? t[t.length - 1][0] : '')).toUpperCase();
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
    brandLabel = null,
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
    /** A tenant's own name for this console (UNITY USA…), set by the layout for
     *  a tenant-branded shop. Replaces the Rollout wordmark; null on Rollout. */
    brandLabel?: string | null;
}) {
    const pathname = usePathname() || '';
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const rank = RANK[callerRole] ?? 0;
    const enabled = new Set(enabledModules);
    const adminOnly = new Set(adminOnlyModules);

    // A tap on a link in the phone sheet navigates; close the sheet with it.
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

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
    const sub = variant === 'sub';

    const navLink = (key: string, href: string, label: string, tag?: boolean) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        const Icon = ICONS[key] ?? ChevronRight;
        return (
            <Link key={key} href={href} className={s.link} aria-current={active ? 'page' : undefined}>
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span className={s.linkLabel}>{label}</span>
                {tag ? (
                    <span
                        className={s.adminTag}
                        title="Hidden for this shop's tier; shown because you are a Rollout admin"
                    >
                        Admin
                    </span>
                ) : null}
                <LinkPending />
            </Link>
        );
    };

    const groups = (
        <>
            {SHOP_NAV_SECTIONS.map((sec) => {
                const items = visible.filter((n) => n.section === sec);
                if (items.length === 0) return null;
                return (
                    <div key={sec} className={s.group}>
                        <div className={s.groupLabel}>{sentence(sec)}</div>
                        {items.map((n) =>
                            navLink(n.href, `/shop/${slug}/${n.href}`, sentence(n.label), adminOnly.has(n.module)),
                        )}
                    </div>
                );
            })}
            {showSellOnNeferstock && rank >= RANK.owner ? (
                <div className={s.group}>
                    <div className={s.groupLabel}>Commerce</div>
                    {navLink('sell', `/shop/${slug}/sell`, 'Sell on NeferStock')}
                </div>
            ) : null}
        </>
    );

    const email = truncEmail(callerEmail);
    const footer = sub ? (
        <div className={s.foot}>
            <ShopThemeToggle className={s.footBtn} />
        </div>
    ) : (
        <div className={s.foot}>
            <Link href={`/shop/${slug}/account`} className={s.who}>
                <span className={s.av} aria-hidden="true">
                    {initials(callerHandle)}
                </span>
                <span className={s.whoText}>
                    @{callerHandle}
                    {email ? <small title={callerEmail ?? undefined}>{email}</small> : null}
                    <small>Role: {sentence(callerRole)}</small>
                </span>
                <ChevronRight size={18} strokeWidth={2} className={s.whoChev} aria-hidden="true" />
            </Link>
            {showSwitchShop ? (
                // A cross-origin href is a real navigation off this host, so it
                // goes out as a plain anchor rather than a Link the router would
                // try to prefetch.
                switchShopHref.startsWith('http') ? (
                    <a href={switchShopHref} className={`g-link ${s.footLink}`}>
                        <ArrowLeftRight size={17} strokeWidth={2} aria-hidden="true" />
                        Switch shop
                    </a>
                ) : (
                    <Link href={switchShopHref} className={`g-link ${s.footLink}`}>
                        <ArrowLeftRight size={17} strokeWidth={2} aria-hidden="true" />
                        Switch shop
                    </Link>
                )
            ) : null}
            <div className={s.footRow}>
                <ShopThemeToggle className={s.footBtn} />
                <button type="button" className={`g-sec g-sec--ink ${s.footBtn}`} onClick={signOut}>
                    <LogOut size={17} strokeWidth={2} aria-hidden="true" />
                    Sign out
                </button>
            </div>
        </div>
    );

    const mark = brandLabel ? (
        <span className={s.tenantMark}>{brandLabel}</span>
    ) : (
        <>
            <span className={s.wm}>rollout</span>
            <span className={s.badge}>
                <Store size={15} strokeWidth={2} aria-hidden="true" />
                Shop console
            </span>
        </>
    );

    const statusChip =
        shopStatus !== 'verified' ? (
            <div className={s.statusChip}>
                <span className="admin-pill warn">{sentence(shopStatus)}</span>
            </div>
        ) : null;

    if (sub) {
        // Inside the admin shell: just the shop card and the links, in a Glide scope.
        return (
            <div className={`glide ${s.side} ${s.sideSub}`} style={{ position: 'static', height: 'auto' }}>
                <div className={s.shopCard}>
                    <p className={s.shopSub}>Acting as @{slug}</p>
                    <h2 className={s.shopName}>{shopName}</h2>
                    {statusChip}
                </div>
                <nav aria-label="Shop console">{groups}</nav>
                {footer}
            </div>
        );
    }

    return (
        <>
            <aside className={s.side} aria-label="Shop console">
                <div className={s.brandRow}>{mark}</div>
                <div className={s.shopCard}>
                    <h2 className={s.shopName}>{shopName}</h2>
                    <p className={s.shopSub}>@{slug}</p>
                    {statusChip}
                </div>
                <nav aria-label="Shop console">{groups}</nav>
                {footer}
            </aside>

            <header className={s.bar}>
                <span className={s.barText}>
                    <b>{shopName}</b>
                    <small>{brandLabel ? brandLabel : `@${slug} · Shop console`}</small>
                </span>
                <button
                    type="button"
                    className={`g-sec g-sec--ink ${s.menuBtn}`}
                    onClick={() => setMenuOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                >
                    <Menu size={18} strokeWidth={2} aria-hidden="true" />
                    Menu
                </button>
            </header>
            <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={shopName}>
                <nav aria-label="Shop console" className={s.sheetNav}>
                    {groups}
                </nav>
                <div className={s.sheetFoot}>{footer}</div>
            </Sheet>
        </>
    );
}
