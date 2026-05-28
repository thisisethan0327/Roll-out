import './globals.css';
import type { Metadata } from 'next';
import { JetBrains_Mono, Inter, Noto_Sans_JP } from 'next/font/google';
import { MarketingChrome } from '@/components/MarketingChrome';

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
    icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html
            lang="en"
            className={`${jetbrains.variable} ${inter.variable} ${notoJp.variable}`}
        >
            <body>
                <MarketingChrome>{children}</MarketingChrome>
            </body>
        </html>
    );
}
