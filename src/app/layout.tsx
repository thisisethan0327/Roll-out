import './globals.css';
import '@/styles/glide-tokens.css';
import '@/styles/glide.css';
import { RevealController } from '@/components/motion/RevealController';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { RouteScrollReset } from '@/components/motion/RouteScrollReset';
import type { Metadata } from 'next';
import { JetBrains_Mono, Inter, Noto_Sans_JP, Chakra_Petch, Michroma, Inter_Tight } from 'next/font/google';
import { MarketingChrome } from '@/components/MarketingChrome';
import { ConfirmHost } from '@/components/glide/confirm';
import { ToastHost } from '@/components/glide/Toast';
import { cookies } from 'next/headers';
import {
    DARK_COOKIE,
    LEGACY_THEME_COOKIE,
    THEME_COOKIE,
    THEME_HEAD_SCRIPT,
    normalizeDark,
    normalizeTheme,
    themeAttribute,
} from '@/lib/theme';
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
// Glide type (docs/design/GLIDE.md): Chakra Petch for display, Michroma for
// numerals and codes, Inter Tight for everything else. Exposed as variables
// that src/styles/glide.css folds into --disp / --wide / --ui with fallbacks.
const chakra = Chakra_Petch({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-glide-disp',
    display: 'swap',
});
const michroma = Michroma({
    subsets: ['latin'],
    weight: '400',
    variable: '--font-glide-wide',
    display: 'swap',
});
const interTight = Inter_Tight({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700'],
    variable: '--font-glide-ui',
    display: 'swap',
});

export const metadata: Metadata = {
    metadataBase: new URL('https://rollout.club'),
    title: {
        default: 'Rollout — A private network for the cars you build',
        template: '%s · Rollout',
    },
    description:
        'Rollout is the private network where builders, shops, and meets actually connect. Track builds, RSVP convoys, talk to your shops — no DM chaos.',
    // No og:url and no canonical here: both are inherited by every page that
    // does not set its own, and a site-wide canonical of "/" told search
    // engines that every event, profile and product was a copy of the home
    // page (SEO audit 2026-10-01). Each public page declares its own.
    openGraph: {
        title: 'Rollout',
        description: 'A private network for the cars you build.',
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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // An explicit theme choice and the dark style are stamped here, server-side,
    // so those first paints are right. "System" stamps no data-theme: the inline
    // head script resolves it from prefers-color-scheme before paint (and the
    // CSS media query covers scripting-off). See lib/theme.ts.
    const jar = await cookies();
    const choice = normalizeTheme(jar.get(THEME_COOKIE)?.value ?? jar.get(LEGACY_THEME_COOKIE)?.value);
    const darkStyle = normalizeDark(jar.get(DARK_COOKIE)?.value);
    // A tenant door serves the console at its root by REWRITE, and a rewrite
    // leaves the browser URL as "/" — so the marketing chrome cannot work this
    // out from the path and has to be told.
    const onTenantHost = !!tenantForHost((await headers()).get('host'));

    return (
        <html
            lang="en"
            data-theme={themeAttribute(choice)}
            data-dark={darkStyle}
            className={`${jetbrains.variable} ${inter.variable} ${notoJp.variable} ${chakra.variable} ${michroma.variable} ${interTight.variable}`}
            // The head script resolves System to light|dark before paint, so the
            // client's data-theme legitimately differs from the server's.
            suppressHydrationWarning
        >
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_HEAD_SCRIPT }} />
            </head>
            <body>
                {/* Motion providers (UI polish §7): Lenis smooth scroll driving
                    ScrollTrigger, and the .rv reveal observer. Both no-ops under
                    reduced motion. */}
                <SmoothScroll />
                <RouteScrollReset />
                <RevealController />
                <MarketingChrome tenantHost={onTenantHost}>{children}</MarketingChrome>
                {/* confirmDialog() renders here (Glide AlertDialog; replaces
                    window.confirm / prompt across the app). */}
                <ConfirmHost />
                {/* toast() / undoToast() render here (src/lib/overlay/toast-store). */}
                <ToastHost />
            </body>
        </html>
    );
}
