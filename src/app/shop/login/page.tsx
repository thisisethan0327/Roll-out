import { headers } from 'next/headers';

import { OtpLoginForm } from '@/components/auth/OtpLoginForm';
import { BrokerSignInButton } from '@/components/auth/BrokerSignInButton';
import { BrokerHashSession } from '@/components/auth/BrokerHashSession';
import { tenantForHost } from '@/lib/tenant-hosts';
import { brandForSlug } from '@/lib/tenant-brand';
import { CircleAlert } from 'lucide-react';
import { AuthShell } from '@/components/glide-auth/AuthShell';

// A sign-in / application door: crawlable, never a search result (no ?next= duplicates).
export const metadata = { title: 'Shop · Sign In', robots: { index: false, follow: true } };

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
    // On a tenant's own door the page carries that tenant's name and none of
    // Rollout's imagery (lib/tenant-brand.ts: their staff never see "Rollout").
    const note = (children: React.ReactNode) => (
        <div className="ga-note">
            <p className="g-note" role="alert">
                <CircleAlert size={18} strokeWidth={2} aria-hidden="true" />
                <span>{children}</span>
            </p>
        </div>
    );
    return (
        <AuthShell
            bare
            barLabel={onTenantDoor ? brand.label : 'rollout'}
            cover={!onTenantDoor}
            edge={!onTenantDoor}
            title="Shop sign in"
            sub={
                <>
                    <b>{onTenantDoor ? brand.label : 'Shop dashboard'}.</b> We&apos;ll email you a 6-digit code. Shop members only.
                </>
            }
        >
            {/* A broker hand-off arrives as tokens in the fragment, which
                survives the middleware 307 from "/" to here. Inert on a
                normal page load. */}
            <BrokerHashSession successPath={safeNext(next)} />
            {error === 'not_member' &&
                note(
                    <>
                        Access denied. You&apos;re not a member of this shop.{' '}
                        {/* The apply route is Rollout's, and a tenant door refuses
                            it — so only offer it where it leads somewhere. */}
                        {onTenantDoor ? null : <a href="/shop/apply?commerce=1">Open a shop</a>}
                    </>,
                )}
            {error === 'suspended' && note(<>This Rollout account is suspended. The shop console is closed to it.</>)}
            {error === 'no_profile' &&
                note(
                    <>
                        {/* Name the shop. The card header says UNITY USA while
                            this sentence used to name no shop at all and point
                            at an "app" a UNITY staffer does not have (run 10,
                            lane F). */}
                        {onTenantDoor
                            ? `That account is not a member of ${brand.label}. Ask the shop owner to add you.`
                            : 'That account is not a member of any shop yet. Ask a shop owner to add you.'}
                    </>,
                )}
            {brokerOrigin && brokerReturn && (
                <>
                    <BrokerSignInButton brokerOrigin={brokerOrigin} returnUrl={brokerReturn} next={next ?? null} look="glide" />
                    <p className="ga-or">or</p>
                </>
            )}
            <OtpLoginForm
                successPath={safeNext(next)}
                redirectSuffix="/shop/login"
                initialEmail={email ?? ''}
                startAtCode={startAtCode}
                notice={notice}
                look="glide"
            />
        </AuthShell>
    );
}
