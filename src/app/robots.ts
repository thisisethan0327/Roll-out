import type { MetadataRoute } from 'next';

/**
 * Crawl policy. Public: the site, the listings, events, profiles, the store's
 * catalogue, the shop application/login doors. Private: the consoles (/admin,
 * /shop/<slug>), the member portal (/me), auth plumbing, cart/checkout/orders.
 * The two /shop/ doors are allowed by a more specific rule than the console
 * block (most-specific match wins for Google and Bing).
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/shop/apply', '/shop/login'],
                disallow: ['/admin', '/me', '/shop/', '/auth/', '/api/', '/store/cart', '/store/checkout', '/store/order/'],
            },
        ],
        sitemap: 'https://rollout.club/sitemap.xml',
        host: 'https://rollout.club',
    };
}
