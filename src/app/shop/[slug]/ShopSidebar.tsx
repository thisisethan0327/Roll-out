'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

type SidebarItem = {
    href: string;
    label: string;
    section: 'TODAY' | 'CUSTOMERS' | 'PUBLIC' | 'SETTINGS';
    /** Min role required to see this link in the sidebar. Routes themselves
     *  enforce server-side; this just hides links the user can't use. */
    minRole?: 'owner' | 'manager' | 'installer';
};

const RANK: Record<string, number> = {
    owner: 5,
    admin: 4,
    manager: 3,
    installer: 2,
    staff: 1,
};

const NAV: SidebarItem[] = [
    { href: 'overview',  label: 'OVERVIEW',  section: 'TODAY',    minRole: 'installer' },
    { href: 'inbox',     label: 'INBOX',     section: 'TODAY',    minRole: 'installer' },
    { href: 'calendar',  label: 'CALENDAR',  section: 'TODAY',    minRole: 'installer' },
    { href: 'tickets',   label: 'TICKETS',   section: 'TODAY',    minRole: 'installer' },
    { href: 'customers', label: 'CUSTOMERS', section: 'CUSTOMERS', minRole: 'installer' },
    { href: 'posts',     label: 'POSTS',     section: 'PUBLIC',   minRole: 'manager' },
    { href: 'events',    label: 'EVENTS',    section: 'PUBLIC',   minRole: 'manager' },
    { href: 'page',      label: 'SHOP PAGE', section: 'PUBLIC',   minRole: 'owner' },
    { href: 'staff',     label: 'STAFF',     section: 'SETTINGS', minRole: 'owner' },
    { href: 'services',  label: 'SERVICES',  section: 'SETTINGS', minRole: 'manager' },
    { href: 'settings/general', label: 'GENERAL',  section: 'SETTINGS', minRole: 'owner' },
    { href: 'settings/email',   label: 'EMAIL',    section: 'SETTINGS', minRole: 'owner' },
    { href: 'settings/billing', label: 'BILLING',  section: 'SETTINGS', minRole: 'owner' },
];

export function ShopSidebar({
    slug,
    shopName,
    callerHandle,
    callerRole,
}: {
    slug: string;
    shopName: string;
    callerHandle: string;
    callerRole: string;
}) {
    const pathname = usePathname() || '';
    const router = useRouter();
    const rank = RANK[callerRole] ?? 0;

    const signOut = async () => {
        const supabase = getSupabaseBrowser();
        await supabase.auth.signOut();
        // Clear active-shop cookie so next sign-in re-prompts when relevant.
        document.cookie = 'rollout_active_shop=; Path=/; Max-Age=0';
        router.push('/shop/login');
        router.refresh();
    };

    const visible = NAV.filter((n) => !n.minRole || rank >= RANK[n.minRole]);
    const sections: SidebarItem['section'][] = ['TODAY', 'CUSTOMERS', 'PUBLIC', 'SETTINGS'];

    return (
        <aside className="shop-sidebar">
            <div className="shop-sidebar-brand">
                <div className="shop-sidebar-brand-word">{shopName.toUpperCase()}</div>
                <div className="shop-sidebar-brand-sub">@{slug} · SHOP DASHBOARD</div>
            </div>
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
                                    <span>{n.label}</span>
                                    {active && <span>›</span>}
                                </Link>
                            );
                        })}
                    </div>
                );
            })}
            <div className="admin-sidebar-foot">
                <div>SIGNED IN AS</div>
                <div style={{ color: 'var(--gold)', marginTop: 4 }}>@{callerHandle}</div>
                <div style={{ marginTop: 6 }}>ROLE: {callerRole.toUpperCase()}</div>
                <div style={{ marginTop: 10 }}>
                    <Link
                        href="/shop/picker"
                        style={{
                            color: 'var(--text-2)',
                            fontFamily: 'var(--font-display)',
                            fontSize: 10,
                            letterSpacing: 'var(--track-wider)',
                            textDecoration: 'none',
                        }}
                    >
                        ⇄ SWITCH SHOP
                    </Link>
                </div>
                <button className="admin-sidebar-signout" onClick={signOut}>
                    SIGN OUT
                </button>
            </div>
        </aside>
    );
}
