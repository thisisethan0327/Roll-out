/**
 * Tenant admin hosts — which hostname belongs to which shop's console.
 *
 * A tenant gets its own door: admin.unityusa.co serves the SAME console code as
 * rollout.club/shop/unityusa, but at the root, skinned as UNITY, so their staff
 * never see Rollout's chrome (Ethan, 2026-09-08).
 *
 * A hard-coded map, not a pattern or a database lookup, for the same reason the
 * sign-in broker's allowlist is hard-coded: this decides which shop's data a
 * hostname can reach, so a second tenant is a deliberate code change and a typo
 * cannot invent one. Middleware runs on every request, so it also must not do
 * I/O to answer this.
 *
 * Keep in step with the broker's return allowlist (UNITY's src/lib/sso/brokers.ts)
 * and the Supabase redirect allowlist — a host added here that is missing from
 * either cannot complete a sign-in.
 */
export type TenantHost = {
    /** Shop slug in rollout.shops — the console tree this host serves. */
    slug: string;
    /** Where "/" lands on this host. */
    landing: string;
};

export const TENANT_ADMIN_HOSTS: Record<string, TenantHost> = {
    'admin.unityusa.co': { slug: 'unityusa', landing: '/shop/unityusa/overview' },
};

/** The tenant this request's host belongs to, or null for Rollout proper. */
export function tenantForHost(host: string | null | undefined): TenantHost | null {
    if (!host) return null;
    // Strip the port so a local :3000 test resolves the same as production.
    const name = host.split(':')[0].trim().toLowerCase();
    return TENANT_ADMIN_HOSTS[name] ?? null;
}

/** Reverse of the map above: which host, if any, is this shop's own door. */
const HOST_BY_SLUG: Record<string, string> = Object.fromEntries(
    Object.entries(TENANT_ADMIN_HOSTS).map(([host, t]) => [t.slug, host]),
);

/**
 * An absolute URL into a shop's console, at that shop's OWN door when it has
 * one.
 *
 * Links baked as https://rollout.club/shop/... are wrong for a tenant: they
 * walk a UNITY staff member out of their own admin and into Rollout, which is
 * exactly what the separate host exists to prevent. This matters most in email,
 * where there is no request to read a host from — an invite sent to UNITY staff
 * has to arrive pointing at admin.unityusa.co.
 *
 * `path` is the console path as it exists under /shop/<slug> — pass
 * '/overview', not '/shop/unityusa/overview'. On a tenant host the shop prefix
 * is dropped, because there the console lives at the root.
 */
export function consoleUrlForShop(slug: string, path = ''): string {
    const clean = path && !path.startsWith('/') ? `/${path}` : path;
    const host = HOST_BY_SLUG[slug];
    if (host) return `https://${host}${clean}`;
    return `https://rollout.club/shop/${slug}${clean}`;
}

/**
 * The origin for a link built while serving a request. Callers with a request
 * host pass it; anything without one falls back to Rollout, which is where
 * those links have always pointed.
 */
export function consoleOrigin(host?: string | null): string {
    const tenant = tenantForHost(host);
    if (tenant && host) return `https://${host.split(':')[0]}`;
    return 'https://rollout.club';
}
