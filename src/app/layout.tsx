import './globals.css';
import { RevealController } from '@/components/motion/RevealController';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import type { Metadata } from 'next';
import { JetBrains_Mono, Inter, Noto_Sans_JP } from 'next/font/google';
import { MarketingChrome } from '@/components/MarketingChrome';
import { cookies } from 'next/headers';
import { THEME_COOKIE, normalizeTheme, themeAttribute } from '@/lib/theme';
import { headers } from 'next/headers';
import { tenantForHost } from '@/lib/tenant-hosts';

const jetbrains = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['500', '700'],
    variable: '--font-display-loaded',
});
const inter = Inter({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-body-loaded',
});
const notoJp = Noto_Sans_JP({
    subsets: ['latin'],
    weight: ['500'],
    variable: '--font-jp-loaded',
});

export const metadata: Metadata = {
    metadataBase: new URL('https://rollout.club'),
    title: {
        default: 'Rollout — A private network for the cars you build',
        template: '%s · Rollout',
    },
    description:
        'Rollout is the private network where builders, shops, and meets actually connect. Track builds, RSVP convoys, talk to your shops — no DM chaos.',
    openGraph: {
        title: 'Rollout',
        description: 'A private network for the cars you build.',
        url: 'https://rollout.club',
        siteName: 'Rollout',
        images: ['/images/og-rollout.jpg'],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Rollout',
        description: 'A private network for the cars you build.',
    },
    icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon.png', type: 'image/png' }], apple: '/apple-touch-icon.png' },
    alternates: { canonical: '/' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // An explicit theme choice is stamped here, server-side, so the very first
    // paint is right — no flash, and no blocking script in <head>. "System"
    // stamps nothing and a prefers-color-scheme block in globals.css takes over.
    const choice = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
    // A tenant door serves the console at its root by REWRITE, and a rewrite
    // leaves the browser URL as "/" — so the marketing chrome cannot work this
    // out from the path and has to be told.
    const onTenantHost = !!tenantForHost((await headers()).get('host'));

    return (
        <html
            lang="en"
            data-theme={themeAttribute(choice)}
            className={`${jetbrains.variable} ${inter.variable} ${notoJp.variable}`}
        >
            <body>
                {/* Motion providers (UI polish §7): Lenis smooth scroll driving
                    ScrollTrigger, and the .rv reveal observer. Both no-ops under
                    reduced motion. */}
                <SmoothScroll />
                <RevealController />
                <MarketingChrome tenantHost={onTenantHost}>{children}</MarketingChrome>
            </body>
        </html>
    );
}
