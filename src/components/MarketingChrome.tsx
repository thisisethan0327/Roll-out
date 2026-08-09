'use client';
/**
 * Conditionally renders the marketing SiteHeader + SiteFooter around the
 * page content. Hidden on /admin/*, /shop/*, and /me/* — those route trees
 * have their own chrome and should not show the public nav.
 */
import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function MarketingChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '';
    const isAdmin =
        pathname.startsWith('/admin') ||
        pathname.startsWith('/shop') ||
        pathname.startsWith('/me');
    if (isAdmin) return <>{children}</>;
    return (
        <>
            <SiteHeader />
            <main>{children}</main>
            <SiteFooter />
        </>
    );
}
