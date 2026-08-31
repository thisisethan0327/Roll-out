/**
 * Product images live in the NeferStock Supabase `products` bucket at full print
 * resolution (3-10MB PNGs). A batch job writes a web-sized twin of each object to
 * `opt/<name>.webp` (900px, WebP q82) with a 1-year immutable cache header.
 *
 * We deliberately do NOT use Supabase's on-the-fly image transformer (its
 * per-request quota was exhausted before and its cache misbehaved) — these are
 * plain pre-generated static objects.
 *
 * Safe to apply to any src: non-product URLs pass through untouched.
 */
const PRODUCTS_PUBLIC = '/storage/v1/object/public/products/';

export function optimizedSrc(url?: string | null): string {
    if (!url) return '';
    const i = url.indexOf(PRODUCTS_PUBLIC);
    if (i === -1) return url;
    const base = url.slice(0, i + PRODUCTS_PUBLIC.length);
    const path = url.slice(i + PRODUCTS_PUBLIC.length);
    if (path.startsWith('opt/')) return url;
    const name = path.split('?')[0];
    if (!/\.(png|jpe?g|webp)$/i.test(name)) return url;
    return base + 'opt/' + name.replace(/\.(png|jpe?g|webp)$/i, '.webp');
}
