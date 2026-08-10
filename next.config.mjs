/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',          // Coolify-friendly: single self-contained build
    reactStrictMode: true,
    images: {
        formats: ['image/avif', 'image/webp'],
        // Product mockups live in the Neferstock/Medusa Supabase storage bucket.
        // Allowing that host lets next/image fetch + transcode them, so the
        // storefront serves resized WebP/AVIF via /_next/image instead of the
        // raw multi-MB catalog PNGs.
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'gueivbfvqupweogjrpzs.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },
};

export default nextConfig;
