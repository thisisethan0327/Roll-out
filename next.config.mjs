/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',          // Coolify-friendly: single self-contained build
    reactStrictMode: true,
    // No floating "N" dev badge: Ethan tests the polish on localhost and it
    // reads as part of the page. Dev-only either way.
    devIndicators: false,
    // Standard hardening headers on every response. No CSP yet: the map loads
    // Leaflet/MapLibre from unpkg and tiles from openfreemap, media from
    // Supabase, payments from Stripe — an allowlist needs a tested pass first.
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(self "https://js.stripe.com")' },
                ],
            },
        ];
    },
    images: {
        formats: ['image/avif', 'image/webp'],
        // Product mockups live in the Neferstock/Medusa Supabase storage bucket.
        // Allowing that host lets next/image fetch + transcode them, so the
        // storefront serves resized WebP/AVIF via /_next/image instead of the
        // raw multi-MB catalog PNGs.
        remotePatterns: [
            {
                // UNITY USA product media (cross-listed catalog, plan v3.1): the
                // Medusa thumbnails point at the UNITY storefront hosts.
                protocol: 'https',
                hostname: 'preview.unityusa.co',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'unityusa.co',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'www.unityusa.co',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'gueivbfvqupweogjrpzs.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
            {
                // Platform storage (event covers, kiosk media, etc.) — lets
                // next/image fetch + transcode the event-cover WEBP heroes.
                protocol: 'https',
                hostname: 'sbbxsqvoxrzcgtslspbo.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },
};

export default nextConfig;
