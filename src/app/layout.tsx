import './globals.css';
import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope, Noto_Sans_JP } from 'next/font/google';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { RevealController } from '@/components/motion/RevealController';
import { MarketingChrome } from '@/components/MarketingChrome';
import { cookies } from 'next/headers';
import { THEME_COOKIE, normalizeTheme, themeAttribute } from '@/lib/theme';
import { headers } from 'next/headers';
import { tenantForHost } from '@/lib/tenant-hosts';

const jetbrains = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['500', '700'],
    variable: '--font-mono-loaded',
});
// Manrope carries display AND body (6F Copper Map): 800 for headlines,
// 400/600/700 for everything else. globals.css reads --font-body-loaded for
// both --font-display and --font-body.
const inter = Manrope({
    subsets: ['latin'],
    weight: ['400', '600', '700', '800'],
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
        images: [{ url: '/images/og-card.jpg', width: 1200, height: 630 }],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Rollout',
        description: 'A private network for the cars you build.',
    },
    icons: {
        icon: [
            { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
            { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { url: '/icon.svg', type: 'image/svg+xml' },
        ],
        apple: '/apple-touch-icon.png',
    },
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
                {/* Motion providers (6F): Lenis smooth scroll driving ScrollTrigger,
                    and the .rv reveal observer. Both no-ops under reduced motion. */}
                <SmoothScroll />
                <RevealController />
                <MarketingChrome tenantHost={onTenantHost}>{children}</MarketingChrome>
            </body>
        </html>
    );
}
