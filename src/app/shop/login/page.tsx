import { headers } from 'next/headers';

import { OtpLoginForm } from '@/components/auth/OtpLoginForm';
import { BrokerSignInButton } from '@/components/auth/BrokerSignInButton';
import { BrokerHashSession } from '@/components/auth/BrokerHashSession';
import { tenantForHost } from '@/lib/tenant-hosts';
import { brandForSlug } from '@/lib/tenant-brand';

export const metadata = { title: 'Shop · Sign In' };

/**
 * Where the broker may send this host's visitors back to.
 *
 * The broker's allowlist is per origin AND per path, and it refuses anything it
 * was not told about. A tenant admin host allows "/" — its console root — so
 * the one-click door works there.
 *
 * rollout.club allows "/shop" (added to the broker allowlist 2026-09-08), which
 * the middleware sends on to whichever console that member belongs to. Any host
 * the broker has not been told about gets no button at all — one that reliably
 * lands you on the broker's error page is worse than none.
 */
const ROLLOUT_HOSTS = new Set(['rollout.club', 'www.rollout.club']);

function brokerReturnFor(host: string | null): string | null {
    if (!host) return null;
    const name = host.split(':')[0].toLowerCase();
    if (tenantForHost(host)) return `https://${name}/`;
    if (ROLLOUT_HOSTS.has(name)) return `https://${name}/shop`;
    return null;
}

/** Only allow same-origin absolute paths, never protocol-relative (`//evil`). */
function safeNext(raw: string | undefined): string {
    if (!raw) return '/shop';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/shop';
    return raw;
}

export default async function ShopLoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        error?: string;
        email?: string;
        step?: string;
        notice?: string;
        next?: string;
    }>;
}) {
    const { error, email, step, notice, next } = await searchParams;
    const startAtCode = step === 'code';
    const host = (await headers()).get('host');
    const brokerReturn = brokerReturnFor(host);
    const brokerOrigin = process.env.NEXT_PUBLIC_SSO_BROKER_ORIGIN ?? '';
    // On a tenant door this is that tenant's brand; on rollout.club, Rollout's.
    const tenant = tenantForHost(host);
    const onTenantDoor = !!tenant;
    const brand = brandForSlug(tenant?.slug ?? null);
    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="admin-login-stamp">
                    <span className="accent">SHOP DASHBOARD</span>
                    <span>{brand.tagline}</span>
                </div>
                {/* A broker hand-off arrives as tokens in the fragment, which
                    survives the middleware 307 from "/" to here. Inert on a
                    normal page load. */}
                <BrokerHashSession successPath={safeNext(next)} />
                <h1 className="admin-login-title">SIGN IN</h1>
                <p className="admin-login-sub">
                    Email OTP. Shop members only.
                </p>
                {error === 'not_member' && (
                    <div className="admin-login-error">
                        Access denied. You&apos;re not a member of this shop.{' '}
                        {/* The apply route is Rollout's, and a tenant door refuses
                            it — so only offer it where it leads somewhere. */}
                        {onTenantDoor ? null : (
                            <a href="/shop/apply?commerce=1" style={{ textDecoration: 'underline' }}>Open a shop →</a>
                        )}
                    </div>
                )}
                {error === 'no_profile' && (
                    <div className="admin-login-error">
                        No profile for that account. Sign up in the app first.
                    </div>
                )}
                {brokerOrigin && brokerReturn && (
                    <BrokerSignInButton
                        brokerOrigin={brokerOrigin}
                        returnUrl={brokerReturn}
                        next={next ?? null}
                    />
                )}
                <OtpLoginForm
                    successPath={safeNext(next)}
                    redirectSuffix="/shop/login"
                    initialEmail={email ?? ''}
                    startAtCode={startAtCode}
                    notice={notice}
                />
            </div>
        </div>
    );
}
