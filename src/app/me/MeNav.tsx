'use client';
/**
 * Consumer-portal top nav. Client component so it can highlight the active
 * section (usePathname) and drive sign-out via a transition.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { signOutAction } from './actions';
import { LinkPending } from '@/components/feedback';

const BASE_LINKS: { href: string; label: string }[] = [
    { href: '/me', label: 'Overview' },
    { href: '/me/appointments', label: 'Appointments' },
    { href: '/me/tickets', label: 'Tickets' },
    { href: '/me/orders', label: 'Orders' },
    { href: '/me/garage', label: 'Garage' },
];

function isActive(pathname: string, href: string): boolean {
    if (href === '/me') return pathname === '/me';
    return pathname === href || pathname.startsWith(href + '/');
}

export function MeNav({ displayName, isHost = false }: { displayName: string; isHost?: boolean }) {
    const pathname = usePathname() || '';
    const [pending, start] = useTransition();
    const LINKS = isHost
        ? [...BASE_LINKS, { href: '/me/events', label: 'Events' }]
        : BASE_LINKS;

    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                background: 'rgba(0,0,0,0.7)',
                borderBottom: '1px solid var(--line)',
            }}
        >
            <div
                className="container"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 64,
                    gap: 16,
                    flexWrap: 'wrap',
                    paddingTop: 8,
                    paddingBottom: 8,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    <Link
                        href="/"
                        style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column' }}
                    >
                        <span
                            className="font-display"
                            style={{ fontWeight: 700, letterSpacing: 4, color: 'var(--text)', fontSize: 16 }}
                        >
                            ROLLOUT
                        </span>
                        <span
                            style={{
                                fontSize: 8,
                                letterSpacing: 2,
                                color: 'var(--gold)',
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            MY ROLLOUT
                        </span>
                    </Link>
                    <nav
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wider)',
                            flexWrap: 'wrap',
                        }}
                    >
                        {LINKS.map((l) => {
                            const active = isActive(pathname, l.href);
                            return (
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    style={{
                                        textDecoration: 'none',
                                        textTransform: 'uppercase',
                                        padding: '6px 10px',
                                        color: active ? 'var(--bg-0)' : 'var(--text-2)',
                                        background: active ? 'var(--gold)' : 'transparent',
                                        border: '1px solid ' + (active ? 'var(--gold)' : 'transparent'),
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    {l.label}
                                    <LinkPending />
                                </Link>
                            );
                        })}
                    </nav>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                        className="text-dim"
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 10,
                            letterSpacing: 'var(--track-wider)',
                            textTransform: 'uppercase',
                        }}
                    >
                        {displayName}
                    </span>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => start(() => void signOutAction())}
                        className="admin-action-btn muted"
                        style={{ cursor: 'pointer' }}
                    >
                        {pending ? 'SIGNING OUT…' : 'SIGN OUT'}
                    </button>
                </div>
            </div>
        </header>
    );
}
