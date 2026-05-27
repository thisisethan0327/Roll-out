/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',          // Coolify-friendly: single self-contained build
    reactStrictMode: true,
    images: {
        formats: ['image/avif', 'image/webp'],
    },
};

export default nextConfig;
