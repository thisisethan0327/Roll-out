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
    { href: '/admin/overview',     label: 'OVERVIEW',     section: 'CONSOLE' },
    { href: '/admin/users',        label: 'USERS',        section: 'CONSOLE' },
    { href: '/admin/shops',        label: 'SHOPS',        section: 'CONSOLE' },
    { href: '/admin/permissions',  label: 'PERMISSIONS',  section: 'CONSOLE' },
    { href: '/admin/appointments', label: 'APPOINTMENTS', section: 'MODERATION' },
    { href: '/admin/events',       label: 'EVENTS',       section: 'MODERATION' },
    { href: '/admin/posts',        label: 'POSTS',        section: 'MODERATION' },
];

export function AdminSidebar({ adminLabel }: { adminLabel: string }) {
    const pathname = usePathname() || '';
    const router = useRouter();

    const signOut = async () => {
        const supabase = getSupabaseBrowser();
        await supabase.auth.signOut();
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
                                <span>{n.label}</span>
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
