import type { MetadataRoute } from 'next';

/** Web app manifest — installable on a phone home screen, black + gold. */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Rollout',
        short_name: 'Rollout',
        description: 'A private network for the cars you build. Shops · Meets · Builds.',
        start_url: '/',
        display: 'standalone',
        background_color: '#050505',
        theme_color: '#050505',
        icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
