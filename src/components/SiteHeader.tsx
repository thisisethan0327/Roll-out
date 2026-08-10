'use client';
/**
 * Public marketing/store header.
 *
 * Structure:
 *   left    — ROLLOUT wordmark (→ /)
 *   primary — MEETS · SHOPS · STORE
 *   more    — FEATURES · HELP (dimmer secondary grouping)
 *   right   — context auth area + GET THE APP CTA
 *
 * Auth/context (signed-in name, SHOP CONSOLE, ADMIN, cart count) is derived
 * server-side and fetched once from /api/nav-context — the marketing site is
 * cookie-free at the middleware layer and the privileged flags need the
 * service-role admin client, so a client fetch of a server route is the robust
 * path (see src/lib/nav-context.ts).
 *
 * Below 820px the inline nav collapses into an accessible hamburger panel
 * (aria-expanded, Escape + backdrop close, scroll lock).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type NavContext = {
    signedIn: boolean;
    displayName: string | null;
    isAdmin: boolean;
    hasShops: boolean;
    cartCount: number;
};

const PRIMARY = [
    { href: '/meets', label: 'Meets' },
    { href: '/shops', label: 'Shops' },
    { href: '/store', label: 'Store' },
];
const SECONDARY = [
    { href: '/#features', label: 'Features' },
    { href: '/help', label: 'Help' },
];

const linkStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: 11,
    letterSpacing: 'var(--track-wider)',
    textTransform: 'uppercase',
};

export function SiteHeader() {
    const pathname = usePathname();
    const [ctx, setCtx] = useState<NavContext | null>(null);
    const [open, setOpen] = useState(false);

    // Fetch context once on mount. Refetch on route change so the cart badge and
    // signed-in state stay fresh after login / add-to-cart navigations.
    useEffect(() => {
        let active = true;
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

    // Close the mobile panel on route change.
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Escape to close + lock scroll while the panel is open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open]);

    const cartCount = ctx?.cartCount ?? 0;

    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 60,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                background: 'rgba(0,0,0,0.7)',
                borderBottom: '1px solid var(--line)',
            }}
        >
            <div
                className="container"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 16 }}
            >
                <Link href="/" style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', flexShrink: 0 }}>
                    <span className="font-display" style={{ fontWeight: 700, letterSpacing: 4, color: 'var(--text)', fontSize: 18 }}>
                        ROLLOUT
                    </span>
                    <span className="text-jp" style={{ fontSize: 9, letterSpacing: 2, marginTop: 1 }}>
                        ／ ロールアウト
                    </span>
                </Link>

                {/* Desktop nav */}
                <nav className="site-nav-desktop" style={{ alignItems: 'center', gap: 24 }}>
                    <div className="flex items-center" style={{ gap: 22 }}>
                        {PRIMARY.map((l) => (
                            <Link key={l.href} href={l.href} className="text-dim" style={linkStyle}>
                                {l.label}
                            </Link>
                        ))}
                    </div>
                    <span style={{ width: 1, height: 14, background: 'var(--line-mid)' }} />
                    <div className="flex items-center" style={{ gap: 18 }}>
                        {SECONDARY.map((l) => (
                            <Link key={l.href} href={l.href} className="text-muted" style={{ ...linkStyle, fontSize: 10 }}>
                                {l.label}
                            </Link>
                        ))}
                    </div>
                    <span style={{ width: 1, height: 14, background: 'var(--line-mid)' }} />
                    <div className="flex items-center" style={{ gap: 18 }}>
                        <AuthArea ctx={ctx} cartCount={cartCount} />
                        <Link href="/#download" className="btn" style={{ padding: '10px 18px', fontSize: 11 }}>
                            Get The App
                        </Link>
                    </div>
                </nav>

                {/* Mobile: cart + hamburger */}
                <div className="site-nav-mobile" style={{ alignItems: 'center', gap: 12 }}>
                    {cartCount > 0 && (
                        <Link href="/store/cart" aria-label={`Cart, ${cartCount} items`} className="text-dim" style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CartGlyph />
                            <span style={{ color: 'var(--gold)' }}>{cartCount}</span>
                        </Link>
                    )}
                    <button
                        type="button"
                        aria-label="Open menu"
                        aria-expanded={open}
                        aria-controls="site-mobile-panel"
                        onClick={() => setOpen(true)}
                        className="site-burger"
                    >
                        <span /><span /><span />
                    </button>
                </div>
            </div>

            {/* Mobile panel */}
            {open && (
                <div
                    className="site-mobile-scrim"
                    onClick={() => setOpen(false)}
                    aria-hidden={false}
                >
                    <div
                        id="site-mobile-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Site menu"
                        className="site-mobile-panel"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="site-mobile-head">
                            <span className="font-display" style={{ fontWeight: 700, letterSpacing: 4, fontSize: 16 }}>
                                ROLLOUT
                            </span>
                            <button
                                type="button"
                                aria-label="Close menu"
                                onClick={() => setOpen(false)}
                                className="site-mobile-close"
                            >
                                ✕
                            </button>
                        </div>

                        <nav className="site-mobile-links">
                            {PRIMARY.map((l) => (
                                <Link key={l.href} href={l.href}>{l.label}</Link>
                            ))}
                            <div className="site-mobile-sep" />
                            {SECONDARY.map((l) => (
                                <Link key={l.href} href={l.href} className="secondary">{l.label}</Link>
                            ))}
                            <div className="site-mobile-sep" />
                            <MobileAuthLinks ctx={ctx} cartCount={cartCount} />
                        </nav>

                        <Link href="/#download" className="btn" style={{ width: '100%', marginTop: 8 }}>
                            Get The App
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}

/* ── Desktop auth cluster ─────────────────────────────────────────────── */
function AuthArea({ ctx, cartCount }: { ctx: NavContext | null; cartCount: number }) {
    // Stable placeholder before context resolves (avoid a flash / layout jump).
    if (ctx === null) {
        return <span style={{ width: 56, height: 12, display: 'inline-block' }} aria-hidden />;
    }

    return (
        <div className="flex items-center" style={{ gap: 18 }}>
            {cartCount > 0 && (
                <Link href="/store/cart" aria-label={`Cart, ${cartCount} items`} className="text-dim" style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CartGlyph />
                    <span style={{ color: 'var(--gold)' }}>{cartCount}</span>
                </Link>
            )}
            {ctx.signedIn ? (
                <>
                    {ctx.hasShops && (
                        <Link href="/shop" className="text-dim" style={linkStyle}>
                            Shop Console
                        </Link>
                    )}
                    {ctx.isAdmin && (
                        <Link href="/admin" className="text-dim" style={linkStyle}>
                            Admin
                        </Link>
                    )}
                    <Link href="/me" className="text-dim" style={{ ...linkStyle, color: 'var(--gold)' }}>
                        My Rollout
                    </Link>
                </>
            ) : (
                <Link href="/login" className="text-dim" style={linkStyle}>
                    Sign In
                </Link>
            )}
        </div>
    );
}

/* ── Mobile auth links ────────────────────────────────────────────────── */
function MobileAuthLinks({ ctx, cartCount }: { ctx: NavContext | null; cartCount: number }) {
    return (
        <>
            {cartCount > 0 && (
                <Link href="/store/cart" className="accent">Cart · {cartCount}</Link>
            )}
            {ctx?.signedIn ? (
                <>
                    <Link href="/me" className="accent">My Rollout</Link>
                    {ctx.hasShops && <Link href="/shop">Shop Console</Link>}
                    {ctx.isAdmin && <Link href="/admin">Admin</Link>}
                </>
            ) : (
                <Link href="/login" className="accent">Sign In</Link>
            )}
        </>
    );
}

function CartGlyph() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="9" cy="20" r="1.4" />
            <circle cx="18" cy="20" r="1.4" />
            <path d="M2 3h3l2.4 12.4a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.3L22 7H6" />
        </svg>
    );
}
