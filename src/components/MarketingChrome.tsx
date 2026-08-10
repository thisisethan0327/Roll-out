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
 */
import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

const CONSOLE_SEGMENTS = new Set(['admin', 'shop', 'me']);

export function MarketingChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '';
    const firstSegment = pathname.split('/')[1] ?? '';
    const isConsole = CONSOLE_SEGMENTS.has(firstSegment);
    if (isConsole) return <>{children}</>;
    return (
        <>
            <SiteHeader />
            <main>{children}</main>
            <SiteFooter />
        </>
    );
}
