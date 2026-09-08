'use client';
/**
 * Conditionally renders the marketing SiteHeader + SiteFooter around the
 * page content. Hidden ONLY on the console trees — /admin/*, /shop/*, and
 * /me/* — which ship their own chrome.
 *
 * Matched on the FIRST PATH SEGMENT, not startsWith(): the old
 * `startsWith('/shop')` also swallowed `/shops` (public directory) and
 * `startsWith('/me')` swallowed `/meets` — both public pages that were
 * silently losing the header. Segment equality keeps /shop hidden while
 * /shops and /meets get the marketing chrome.
 *
 * AND NEVER on a tenant admin host. admin.unityusa.co rewrites "/" to that
 * shop's console, but a rewrite does not change the browser URL, so
 * usePathname() still reports "/" and this component happily wrapped the
 * console in Rollout's header and footer — MEETS · SHOPS · STORE above a UNITY
 * admin (run 9, lane D). The host cannot be read from a client component, so
 * the server layout passes it down.
 */
import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

const CONSOLE_SEGMENTS = new Set(['admin', 'shop', 'me']);

export function MarketingChrome({
    children,
    tenantHost = false,
}: {
    children: React.ReactNode;
    /** True on a tenant admin door, where Rollout chrome never belongs. */
    tenantHost?: boolean;
}) {
    const pathname = usePathname() || '';
    const firstSegment = pathname.split('/')[1] ?? '';
    const isConsole = tenantHost || CONSOLE_SEGMENTS.has(firstSegment);
    if (isConsole) return <>{children}</>;
    return (
        <>
            <SiteHeader />
            <main>{children}</main>
            <SiteFooter />
        </>
    );
}
