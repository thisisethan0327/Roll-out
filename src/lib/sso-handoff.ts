/**
 * One-click hand-off to a sibling storefront through the ecosystem broker
 * (id.neferstock.com): identity is shared (one Supabase user, one Medusa
 * customer), the SESSION is not — a plain link to unityusa.co arrives signed
 * out. The broker mints the session on the return origin; its allowlist is
 * per origin AND per path, and /us/account is UNITY's allowlisted landing,
 * so the configurator path rides along as ?next= on that landing (the UNITY
 * side continues to it after the hand-off).
 *
 * Only used when the visitor HAS a Rollout session; signed-out visitors get
 * the plain link (the broker page would only ask them to sign in).
 */
const UNITY_ORIGIN = 'https://unityusa.co';

/** The configurator page for a UNITY product, as a same-origin path on unityusa.co. */
export function unityConfiguratorPath(handle: string): string {
    return `/us/products/${encodeURIComponent(handle)}`;
}

/** The broker start URL that lands a signed-in visitor on the configurator. Null without a broker origin. */
export function unityConfiguratorHandoffUrl(handle: string, brokerOrigin: string | undefined): string | null {
    const origin = (brokerOrigin ?? '').trim().replace(/\/+$/, '');
    if (!origin) return null;
    const landing = `${UNITY_ORIGIN}/us/account?next=${encodeURIComponent(unityConfiguratorPath(handle))}`;
    return `${origin}/id/start?return=${encodeURIComponent(landing)}`;
}
