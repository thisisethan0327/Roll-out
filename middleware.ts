/**
 * Two jobs, in this order.
 *
 * 1. TENANT HOST GATING. A tenant admin host (admin.unityusa.co) serves the
 *    same console code as rollout.club/shop/<slug>, but at its own root and
 *    skinned as that tenant. On such a host: "/" rewrites to that shop's
 *    console, another shop's tree is refused, and the rest of Rollout —
 *    /meets, /store, profiles — is not reachable at all. A UNITY staff member
 *    should never end up looking at Rollout's marketing site from their own
 *    admin door (Ethan, 2026-09-08).
 *
 *    "/" REWRITES rather than redirects, deliberately: the sign-in broker's
 *    return allowlist points at "/" on this origin, and the URL somebody lands
 *    on has to stay the one the broker was told about.
 *
 * 2. SUPABASE COOKIE REFRESH, so Server Components always see a valid session.
 *    Only for the auth-gated trees, exactly as before — the marketing site
 *    stays cookie-free, which is why this runs after the gating and only for
 *    those paths.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { tenantForHost } from '@/lib/tenant-hosts';

/** Paths that must work on a tenant host regardless of the shop gating. */
function isAlwaysAllowed(pathname: string): boolean {
    return (
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/api/') ||
        pathname === '/shop/login' ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml'
    );
}

function gateTenantHost(request: NextRequest, slug: string, landing: string) {
    const { pathname, search } = request.nextUrl;

    if (isAlwaysAllowed(pathname)) return null;

    // The console tree this host owns.
    if (pathname === `/shop/${slug}` || pathname.startsWith(`/shop/${slug}/`)) {
        return null;
    }

    // Root → this shop's console, as a rewrite so the URL stays "/".
    if (pathname === '/') {
        const url = request.nextUrl.clone();
        url.pathname = landing;
        url.search = search;
        return NextResponse.rewrite(url);
    }

    // Anything else on this host — another shop's console, or Rollout's own
    // surfaces — is not this door's business. Send them to their console rather
    // than 404ing, so a stale link lands somewhere useful instead of a dead end,
    // and without revealing whether the other shop exists.
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
    const tenant = tenantForHost(request.headers.get('host'));

    if (tenant) {
        const gated = gateTenantHost(request, tenant.slug, tenant.landing);
        if (gated) return gated;
    }

    // Cookie refresh only for the auth-gated trees. On a tenant host "/" is the
    // console, so it needs a session too.
    const { pathname } = request.nextUrl;
    const needsSession =
        (tenant && pathname === '/') ||
        pathname.startsWith('/admin/') ||
        pathname.startsWith('/shop/') ||
        pathname.startsWith('/me/');
    if (!needsSession) return NextResponse.next({ request });

    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Touch getUser to trigger token refresh if the access token expired.
    await supabase.auth.getUser();

    return response;
}

/**
 * Widened from the old /admin|/shop|/me matcher because the tenant gating has
 * to see every request on its host — including "/" and the Rollout surfaces it
 * refuses. Static assets and image optimisation are excluded: they are hot, and
 * nothing above applies to them.
 */
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|images/|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)',
    ],
};
