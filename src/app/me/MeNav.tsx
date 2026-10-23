'use client';
/**
 * My Rollout header, in Glide (board: G3 web host console header).
 *
 *   left    rollout wordmark (→ /) and the My Rollout badge
 *   centre  floating pill nav over the /me sections, the current one a navy
 *           roundel; below 1240px it moves to its own scrolling row
 *   right   the member (avatar roundel, name, @handle) and Sign out
 *
 * Client component so it can mark the active section (usePathname) and drive
 * sign-out via a transition. Same links and the same sign-out as before.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { signOutAction } from './actions';
import { LinkPending } from '@/components/feedback';
import s from '@/components/glide-console/console.module.css';

const BASE_LINKS: { href: string; label: string }[] = [
    { href: '/me', label: 'Overview' },
    { href: '/me/appointments', label: 'Appointments' },
    { href: '/me/tickets', label: 'Tickets' },
    { href: '/me/orders', label: 'Orders' },
    { href: '/me/garage', label: 'Garage' },
    { href: '/me/settings', label: 'Settings' },
];

function isActive(pathname: string, href: string): boolean {
    if (href === '/me') return pathname === '/me';
    return pathname === href || pathname.startsWith(href + '/');
}

function initials(name: string): string {
    const parts = name.replace(/^@+/, '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '?';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
}

export function MeNav({
    displayName,
    handle,
    avatarUrl,
    isHost = false,
    ticketsEnabled = false,
}: {
    displayName: string;
    handle?: string | null;
    avatarUrl?: string | null;
    isHost?: boolean;
    /** Multi-ticket packages (feature-gated) — adds the /me/event-tickets
     *  link. False (the default) keeps this nav exactly as it is today. */
    ticketsEnabled?: boolean;
}) {
    const pathname = usePathname() || '';
    const [pending, start] = useTransition();
    let LINKS = BASE_LINKS;
    if (ticketsEnabled) LINKS = [...LINKS, { href: '/me/event-tickets', label: 'Event tickets' }];
    if (isHost) LINKS = [...LINKS, { href: '/me/events', label: 'Events' }];

    return (
        <header className={`glide ${s.bar}`}>
            <div className={`g-wrap ${s.barIn}`}>
                <div className={s.brand}>
                    <Link href="/" className={s.wm} aria-label="Rollout home">
                        rollout
                    </Link>
                    <span className={s.badge}>
                        <UserRound size={16} strokeWidth={2} aria-hidden="true" />
                        My Rollout
                    </span>
                </div>

                <nav className={`g-fp ${s.nav}`} aria-label="My Rollout">
                    {LINKS.map((l) => (
                        <Link key={l.href} href={l.href} aria-current={isActive(pathname, l.href) ? 'page' : undefined}>
                            {l.label}
                            <LinkPending />
                        </Link>
                    ))}
                </nav>

                <div className={s.right}>
                    <span className={s.who}>
                        <span
                            className={s.av}
                            style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
                            role="img"
                            aria-label={displayName}
                        >
                            {avatarUrl ? null : initials(displayName)}
                        </span>
                        <span className={s.whoText}>
                            {displayName}
                            {handle ? <small>@{handle}</small> : null}
                        </span>
                    </span>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => start(() => void signOutAction())}
                        className={`g-sec g-sec--ink ${s.signOut}`}
                        aria-label={pending ? 'Signing out' : 'Sign out'}
                    >
                        <LogOut size={17} strokeWidth={2} aria-hidden="true" />
                        <span className={s.signOutLabel}>{pending ? 'Signing out…' : 'Sign out'}</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
