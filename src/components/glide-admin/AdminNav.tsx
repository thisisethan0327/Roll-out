'use client';
/**
 * Glide admin navigation (board G3 patterns): the sidebar panel on desktop and,
 * below 900px, a top bar whose Menu button opens the same links in a kit
 * Sheet. Same links, same badges and the same GLOBAL sign-out as the legacy
 * AdminSidebar (one account across rollout.club, EMWRAPS, NeferStock and
 * UNITY: never 'local').
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import {
    BadgeCheck,
    CalendarClock,
    CalendarDays,
    Flag,
    KeyRound,
    LayoutDashboard,
    LogOut,
    Megaphone,
    Menu,
    Newspaper,
    Scale,
    ScrollText,
    ShieldCheck,
    Store,
    Users,
} from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { Sheet } from '@/components/glide/Sheet';
import { Tricolore } from '@/components/glide/primitives';
import s from './admin.module.css';

type Section = 'Console' | 'Moderation';
type NavItem = { href: string; label: string; section: Section; icon: ReactNode };

const ic = { size: 20, strokeWidth: 1.9, 'aria-hidden': true } as const;

const NAV: NavItem[] = [
    { href: '/admin/overview', label: 'Overview', section: 'Console', icon: <LayoutDashboard {...ic} /> },
    { href: '/admin/verifications', label: 'Verifications', section: 'Console', icon: <BadgeCheck {...ic} /> },
    { href: '/admin/users', label: 'Users', section: 'Console', icon: <Users {...ic} /> },
    { href: '/admin/shops', label: 'Shops', section: 'Console', icon: <Store {...ic} /> },
    { href: '/admin/permissions', label: 'Permissions', section: 'Console', icon: <KeyRound {...ic} /> },
    { href: '/admin/audit', label: 'Activity log', section: 'Console', icon: <ScrollText {...ic} /> },
    { href: '/admin/appointments', label: 'Appointments', section: 'Moderation', icon: <CalendarClock {...ic} /> },
    { href: '/admin/events', label: 'Events', section: 'Moderation', icon: <CalendarDays {...ic} /> },
    { href: '/admin/announcements', label: 'Announcements', section: 'Moderation', icon: <Megaphone {...ic} /> },
    { href: '/admin/posts', label: 'Posts', section: 'Moderation', icon: <Newspaper {...ic} /> },
    { href: '/admin/reports', label: 'Reports', section: 'Moderation', icon: <Flag {...ic} /> },
    { href: '/admin/appeals', label: 'Appeals', section: 'Moderation', icon: <Scale {...ic} /> },
];
const SECTIONS: Section[] = ['Console', 'Moderation'];

function initials(handle: string): string {
    return (handle.replace(/^@+/, '').replace(/[^a-z0-9]/gi, '').slice(0, 2) || '?').toUpperCase();
}

export function AdminNav({
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
    const [menuOpen, setMenuOpen] = useState(false);
    const [signingOut, start] = useTransition();

    const signOut = () =>
        start(async () => {
            const supabase = getSupabaseBrowser();
            // Global by design (Ethan, 2026-09-08): one account across rollout.club, EMWRAPS,
            // NeferStock and UNITY, so signing out here signs out everywhere. Never 'local'.
            await supabase.auth.signOut({ scope: 'global' });
            router.push('/admin/login');
            router.refresh();
        });

    const countFor = (href: string): number =>
        href === '/admin/overview'
            ? attentionCount
            : href === '/admin/reports'
              ? reportsCount
              : href === '/admin/appeals'
                ? appealsCount
                : 0;
    const total = attentionCount + reportsCount + appealsCount;

    const links = (onNavigate?: () => void) =>
        SECTIONS.map((sec) => (
            <div key={sec}>
                <div className={s.navSec} id={`adm-nav-${sec}`}>
                    {sec}
                </div>
                <ul className={s.navList} aria-labelledby={`adm-nav-${sec}`}>
                    {NAV.filter((n) => n.section === sec).map((n) => {
                        const active = pathname === n.href || pathname.startsWith(n.href + '/');
                        const c = countFor(n.href);
                        return (
                            <li key={n.href}>
                                <Link
                                    href={n.href}
                                    className={s.navLink}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={onNavigate}
                                >
                                    {n.icon}
                                    <span className={s.navLabel}>{n.label}</span>
                                    {c > 0 ? (
                                        <span className={s.count} aria-label={`${c} open`}>
                                            {c}
                                        </span>
                                    ) : null}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        ));

    const who = (
        <>
            <span className={s.av} aria-hidden="true">
                {initials(adminLabel)}
            </span>
            <span className={s.who}>
                Signed in as
                <b>{adminLabel}</b>
            </span>
            <button
                type="button"
                className={s.signOut}
                onClick={signOut}
                disabled={signingOut}
                aria-label={signingOut ? 'Signing out' : 'Sign out'}
                title="Sign out everywhere"
            >
                <LogOut size={18} strokeWidth={2} aria-hidden="true" />
            </button>
        </>
    );

    const brand = (
        <div className={s.brand}>
            <Link href="/admin/overview" className={s.wm} aria-label="Rollout admin overview">
                rollout
            </Link>
            <span className={s.badge}>
                <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
                Admin
            </span>
        </div>
    );

    return (
        <>
            <aside className={s.side} aria-label="Admin">
                {brand}
                <Tricolore thin className={s.tri} />
                <nav aria-label="Admin sections">{links()}</nav>
                <div className={s.foot}>{who}</div>
            </aside>

            <div className={s.topbar}>
                {brand}
                <button
                    type="button"
                    className={s.menuBtn}
                    onClick={() => setMenuOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                >
                    <Menu size={18} strokeWidth={2} aria-hidden="true" />
                    Menu
                    {total > 0 ? (
                        <span className={s.count} aria-label={`${total} open`}>
                            {total}
                        </span>
                    ) : null}
                </button>
            </div>
            <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Admin">
                <nav className={s.sheetNav} aria-label="Admin sections">
                    {links(() => setMenuOpen(false))}
                </nav>
                <div className={s.sheetFoot}>{who}</div>
            </Sheet>
        </>
    );
}
