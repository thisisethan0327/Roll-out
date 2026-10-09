/**
 * Three jobs, in this order.
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
 * 2. ONE INDEXABLE HOST. The same app also answers on www.rollout.club and on
 *    Coolify's default rollout.<ip>.sslip.io name, and both served full 200
 *    pages (SEO audit 2026-10-01). They now 308 to https://rollout.club with
 *    the path and query kept. Any other host that still reaches a page — a
 *    branch preview on another sslip.io name, localhost — is answered with
 *    X-Robots-Tag: noindex instead, so a preview can keep working without
 *    competing with the real site.
 *
 * 3. SUPABASE COOKIE REFRESH, so Server Components always see a valid session.
 *    Only for the auth-gated trees, exactly as before — the marketing site
 *    stays cookie-free, which is why this runs after the gating and only for
 *    those paths.
 *
 * 4. BAN LOCKDOWN (Part 2, Ethan 2026-10-09). A banned member can sign in ONLY
 *    to /suspended. For the LOCKED trees (see isBanLocked) a GET/HEAD from a
 *    signed-in, banned user is redirected to /suspended. This is the first
 *    layer; the server guards (requireSession / requireConsumer / /auth/landing
 *    / onboarding) are the second and remain the actual gate. It NEVER touches
 *    server-action POSTs (a redirect would break the action's RSC response),
 *    fails OPEN on any RPC error (the guards still enforce), and leaves
 *    /suspended, /auth/*, /api/* and static assets alone.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ROLLOUT_ORIGIN, tenantForHost } from '@/lib/tenant-hosts';
import { isBannedUntil } from '@/lib/ban';

/** The only host search engines should index. */
const CANONICAL_HOST = new URL(ROLLOUT_ORIGIN).hostname;

/** Hostname from a Host header, without the port, lower-cased. */
function hostName(host: string | null | undefined): string {
    return (host ?? '').split(':')[0].trim().toLowerCase();
}

/**
 * Aliases of the canonical site that redirect to it: www, and this app's own
 * Coolify default name (rollout.<server-ip>.sslip.io — matched by shape, so a
 * server move does not reopen it). Previews run on other sslip.io names
 * (restyle.<ip>.sslip.io) and are deliberately not in here.
 */
function isCanonicalAlias(host: string): boolean {
    return host === `www.${CANONICAL_HOST}` || (host.startsWith('rollout.') && host.endsWith('.sslip.io'));
}

/** Mark a response from a non-canonical host as not for search engines. */
function withHostPolicy(response: NextResponse, noindex: boolean): NextResponse {
    if (noindex) response.headers.set('X-Robots-Tag', 'noindex');
    return response;
}

/** Paths that must work on a tenant host regardless of the shop gating. */
function isAlwaysAllowed(pathname: string): boolean {
    return (
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/api/') ||
        // A banned staff member's guards redirect here; without this the tenant
        // gate would bounce them back to the console they were just refused.
        pathname === '/suspended' ||
        pathname === '/shop/login' ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml'
    );
}

function gateTenantHost(
    request: NextRequest,
    slug: string,
    landing: string,
    movedTo?: string,
) {
    const { pathname, search } = request.nextUrl;

    // The tenant has their own admin now: this host only carries old links
    // there. 308 rather than 302 so it is cached and the method is preserved,
    // and EVERY path goes to the admin root — the two consoles do not share a
    // URL shape, so mapping paths across would invent links that do not exist.
    // Deliberately ahead of isAlwaysAllowed: once a door is closed, it is
    // closed for sign-in callbacks too, which now belong to the new admin.
    if (movedTo) return NextResponse.redirect(movedTo, 308);

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

/**
 * Trees a banned member may not open: the member area, the shop console and
 * its sign-in/apply doors, the admin console, onboarding, and the sign-in/up
 * pages. Public content (events, profiles, store, meets, help...) stays
 * browsable. /suspended, /auth/*, /api/* are deliberately NOT here.
 */
const BAN_LOCKED_PREFIXES = ['/me', '/shop', '/admin', '/signup/onboarding', '/login', '/signup'] as const;

function isBanLocked(pathname: string, tenant: boolean): boolean {
    if (tenant && pathname === '/') return true;
    return BAN_LOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Rollout ban state from rollout.my_ban() on the caller's own session; fails open. */
async function isCallerBanned(supabase: ReturnType<typeof createServerClient>): Promise<boolean> {
    try {
        const { data, error } = await supabase.schema('rollout').rpc('my_ban');
        if (error) {
            // Pre-091 (no RPC) is expected to land here too; only log the odd ones.
            if (!['PGRST202', '42883', 'PGRST106', '3F000'].includes(String(error.code))) {
                console.error('[middleware] my_ban failed (failing open):', error.code, error.message);
            }
            return false;
        }
        return isBannedUntil((data as any)?.banned_until ?? null);
    } catch (e) {
        console.error('[middleware] my_ban threw (failing open):', e instanceof Error ? e.message : e);
        return false;
    }
}

export async function middleware(request: NextRequest) {
    const tenant = tenantForHost(request.headers.get('host'));

    if (tenant) {
        const gated = gateTenantHost(request, tenant.slug, tenant.landing, tenant.movedTo);
        if (gated) return gated;
    }

    // One indexable host: aliases redirect, anything else non-canonical is
    // served but marked noindex. After the tenant gating, so a tenant door
    // behaves exactly as before.
    const host = hostName(request.headers.get('host'));
    if (!tenant && isCanonicalAlias(host)) {
        const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, ROLLOUT_ORIGIN);
        return NextResponse.redirect(target, 308);
    }
    const noindex = host !== CANONICAL_HOST;

    // Cookie refresh only for the auth-gated trees. On a tenant host "/" is the
    // console, so it needs a session too.
    const { pathname } = request.nextUrl;
    // The /me layout gates the whole tree and needs the leaf path for its
    // sign-in bounce (?next=); a layout cannot read the pathname itself.
    request.headers.set('x-pathname', pathname);
    const needsSession =
        (tenant && pathname === '/') ||
        pathname.startsWith('/admin/') ||
        pathname.startsWith('/shop/') ||
        pathname.startsWith('/me/') ||
        pathname === '/suspended' ||
        isBanLocked(pathname, !!tenant);
    if (!needsSession) return withHostPolicy(NextResponse.next({ request }), noindex);

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
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Ban lockdown: GET/HEAD only, signed-in only, locked trees only.
    if (
        user &&
        (request.method === 'GET' || request.method === 'HEAD') &&
        isBanLocked(pathname, !!tenant) &&
        (await isCallerBanned(supabase))
    ) {
        // RELATIVE Location (see auth/landing/route.ts: absolute URLs built from
        // req.url are wrong behind the Coolify proxy). Carry any refreshed
        // session cookies onto the redirect.
        const redirect = new NextResponse(null, { status: 307, headers: { Location: '/suspended' } });
        response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
        return withHostPolicy(redirect, noindex);
    }

    return withHostPolicy(response, noindex);
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
