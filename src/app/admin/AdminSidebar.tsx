'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

type NavItem = {
    href: string;
    label: string;
    section: 'CONSOLE' | 'MODERATION' | 'SYSTEM';
};

const NAV: NavItem[] = [
    { href: '/admin/overview',       label: 'OVERVIEW',      section: 'CONSOLE' },
    { href: '/admin/verifications',  label: 'VERIFICATIONS', section: 'CONSOLE' },
    { href: '/admin/users',          label: 'USERS',         section: 'CONSOLE' },
    { href: '/admin/shops',          label: 'SHOPS',         section: 'CONSOLE' },
    { href: '/admin/permissions',    label: 'PERMISSIONS',   section: 'CONSOLE' },
    { href: '/admin/audit',          label: 'ACTIVITY LOG',  section: 'CONSOLE' },
    { href: '/admin/appointments', label: 'APPOINTMENTS', section: 'MODERATION' },
    { href: '/admin/events',       label: 'EVENTS',       section: 'MODERATION' },
    { href: '/admin/announcements', label: 'ANNOUNCEMENTS', section: 'MODERATION' },
    { href: '/admin/posts',        label: 'POSTS',        section: 'MODERATION' },
    { href: '/admin/reports',      label: 'REPORTS',      section: 'MODERATION' },
    { href: '/admin/appeals',      label: 'APPEALS',      section: 'MODERATION' },
];

export function AdminSidebar({
    adminLabel,
    attentionCount = 0,
    reportsCount = 0,
    appealsCount = 0,
}: {
    adminLabel: string;
    attentionCount?: number;
    reportsCount?: number;
    appealsCount?: number;
}) {
    const pathname = usePathname() || '';
    const router = useRouter();

    const signOut = async () => {
        const supabase = getSupabaseBrowser();
        // Global by design (Ethan, 2026-09-08): one account across rollout.club, EMWRAPS,
        // NeferStock and UNITY, so signing out here signs out everywhere. Never 'local'.
        await supabase.auth.signOut({ scope: 'global' });
        router.push('/admin/login');
        router.refresh();
    };

    const sections: NavItem['section'][] = ['CONSOLE', 'MODERATION'];

    return (
        <aside className="admin-sidebar">
            <div className="admin-sidebar-brand">
                <div className="admin-sidebar-brand-word">ROLLOUT</div>
                <div className="admin-sidebar-brand-sub">GOD MODE / ADMIN</div>
            </div>
            {sections.map((sec) => (
                <div key={sec}>
                    <div className="admin-sidebar-section">{sec}</div>
                    {NAV.filter((n) => n.section === sec).map((n) => {
                        const active = pathname === n.href || pathname.startsWith(n.href + '/');
                        return (
                            <Link
                                key={n.href}
                                href={n.href}
                                className={`admin-sidebar-link ${active ? 'active' : ''}`}
                            >
                                <span>
                                    {n.label}
                                    {n.href === '/admin/overview' && attentionCount > 0 && (
                                        <span className="admin-sidebar-badge">{attentionCount}</span>
                                    )}
                                    {n.href === '/admin/reports' && reportsCount > 0 && (
                                        <span className="admin-sidebar-badge">{reportsCount}</span>
                                    )}
                                    {n.href === '/admin/appeals' && appealsCount > 0 && (
                                        <span className="admin-sidebar-badge">{appealsCount}</span>
                                    )}
                                </span>
                                {active && <span>›</span>}
                            </Link>
                        );
                    })}
                </div>
            ))}
            <div className="admin-sidebar-foot">
                SIGNED IN AS
                <div style={{ color: 'var(--gold)', marginTop: 4 }}>{adminLabel}</div>
                <button className="admin-sidebar-signout" onClick={signOut}>
                    SIGN OUT
                </button>
            </div>
        </aside>
    );
}
