'use client';
/**
 * Public site header, in Glide (docs/design/GLIDE.md; board: R5 "Web home").
 *
 *   left    rollout wordmark (→ /)
 *   centre  floating pill nav: Meets · Runs · Shops · Store, the current one a
 *           navy roundel
 *   right   Sign in + Create account, or, signed in: cart, Shop console,
 *           Admin and My Rollout
 *
 * Auth/context (signed-in, SHOP CONSOLE, ADMIN, cart count) is derived
 * server-side and fetched once per route from /api/nav-context — the marketing
 * site is cookie-free at the middleware layer and the privileged flags need the
 * service-role admin client (see src/lib/nav-context.ts).
 *
 * Below 900px the nav collapses into a menu button that opens a Glide sheet
 * (Escape, scrim and × close it; focus returns to the button).
 *
 * "Runs" is the Night Run filter of /meets — the closest real list to the
 * board's Runs tab; there is no separate runs directory yet.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight, Menu, ShoppingBag } from 'lucide-react';
import { GlideButton } from './glide/primitives';
import { Sheet } from './glide/Sheet';

type NavContext = {
    signedIn: boolean;
    displayName: string | null;
    isAdmin: boolean;
    hasShops: boolean;
    cartCount: number;
};

type NavKey = 'meets' | 'runs' | 'shops' | 'store';
const PRIMARY: { key: NavKey; href: string; label: string }[] = [
    { key: 'meets', href: '/meets', label: 'Meets' },
    { key: 'runs', href: '/meets?type=NIGHT_RUN', label: 'Runs' },
    { key: 'shops', href: '/shops', label: 'Shops' },
    { key: 'store', href: '/store', label: 'Store' },
];

function activeKey(pathname: string, search: string): NavKey | null {
    const seg = pathname.split('/')[1] ?? '';
    if (seg === 'meets') return /(?:^|[?&])type=NIGHT_RUN(?:&|$)/.test(search) ? 'runs' : 'meets';
    if (seg === 'event') return 'meets';
    if (seg === 'shops') return 'shops';
    if (seg === 'store') return 'store';
    return null;
}

export function SiteHeader() {
    const pathname = usePathname() || '/';
    const [ctx, setCtx] = useState<NavContext | null>(null);
    const [open, setOpen] = useState(false);
    // The query string is read after mount (useSearchParams would force every
    // static page under this layout into client rendering).
    const [search, setSearch] = useState('');

    // Fetch context once per route so the cart badge and signed-in state stay
    // fresh after login / add-to-cart navigations.
    useEffect(() => {
        let active = true;
        setSearch(window.location.search);
        fetch('/api/nav-context', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (active && d) setCtx(d as NavContext);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [pathname]);

    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    const current = activeKey(pathname, search);
    const cartCount = ctx?.cartCount ?? 0;

    return (
        <header className="glide g-nav">
            <div className="g-wrap g-nav-in">
                <Link href="/" className="g-wm" aria-label="Rollout home">
                    rollout
                </Link>

                <nav className="g-nav-pill g-fp" aria-label="Primary">
                    {PRIMARY.map((l) => (
                        <Link key={l.key} href={l.href} aria-current={current === l.key ? 'page' : undefined}>
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className="g-nav-right">
                    {cartCount > 0 ? (
                        <Link href="/store/cart" className="g-cb g-fp g-nav-cart" aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}>
                            <ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" />
                            <span className="g-w" aria-hidden="true">
                                {cartCount}
                            </span>
                        </Link>
                    ) : null}
                    <AuthArea ctx={ctx} />
                    <button
                        type="button"
                        className="g-cb g-fp g-nav-burger"
                        aria-label="Open menu"
                        aria-expanded={open}
                        aria-haspopup="dialog"
                        onClick={() => setOpen(true)}
                    >
                        <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
                <ul className="g-rows g-menu-links">
                    {PRIMARY.map((l) => (
                        <li key={l.key}>
                            <Link className="g-row" href={l.href} aria-current={current === l.key ? 'page' : undefined}>
                                <span className="g-row-t">
                                    <b>{l.label}</b>
                                </span>
                                <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                    {cartCount > 0 ? (
                        <li>
                            <Link className="g-row" href="/store/cart">
                                <span className="g-row-t">
                                    <b>Cart</b>
                                    <small>
                                        {cartCount} {cartCount === 1 ? 'item' : 'items'}
                                    </small>
                                </span>
                                <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </li>
                    ) : null}
                    {ctx?.signedIn && ctx.hasShops ? (
                        <li>
                            <Link className="g-row" href="/shop">
                                <span className="g-row-t">
                                    <b>Shop console</b>
                                </span>
                                <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </li>
                    ) : null}
                    {ctx?.signedIn && ctx.isAdmin ? (
                        <li>
                            <Link className="g-row" href="/admin">
                                <span className="g-row-t">
                                    <b>Admin</b>
                                </span>
                                <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </li>
                    ) : null}
                    <li>
                        <Link className="g-row" href="/help">
                            <span className="g-row-t">
                                <b>Help</b>
                            </span>
                            <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />
                        </Link>
                    </li>
                </ul>
                <div className="g-menu-cta">
                    {ctx?.signedIn ? (
                        <GlideButton href="/me" block>
                            My Rollout
                        </GlideButton>
                    ) : (
                        <>
                            <GlideButton href="/signup" block>
                                Create account
                            </GlideButton>
                            <Link href="/login" className="g-sec">
                                Sign in
                            </Link>
                        </>
                    )}
                </div>
            </Sheet>
        </header>
    );
}

function AuthArea({ ctx }: { ctx: NavContext | null }) {
    // Hold the space before the context resolves, so the bar does not jump.
    if (ctx === null) {
        return <span className="g-hide-narrow" style={{ width: 236, height: 52, display: 'inline-block' }} aria-hidden="true" />;
    }
    if (ctx.signedIn) {
        return (
            <>
                {ctx.hasShops ? (
                    <Link href="/shop" className="g-nav-text g-hide-narrow">
                        Shop console
                    </Link>
                ) : null}
                {ctx.isAdmin ? (
                    <Link href="/admin" className="g-nav-text g-hide-narrow">
                        Admin
                    </Link>
                ) : null}
                <GlideButton href="/me" size="sm" className="g-hide-narrow">
                    My Rollout
                </GlideButton>
            </>
        );
    }
    return (
        <>
            <Link href="/login" className="g-nav-text g-hide-narrow">
                Sign in
            </Link>
            <GlideButton href="/signup" size="sm" className="g-hide-narrow">
                Create account
            </GlideButton>
        </>
    );
}
