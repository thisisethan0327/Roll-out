/**
 * /auth/landing?next=… — the server-side step after every sign-in.
 *
 * /auth/callback consumes the auth token in the BROWSER (the session can arrive
 * in the URL hash) and then hard-navigates. It cannot read the member's profile,
 * so the "has this person chosen a handle yet" decision has to happen one hop
 * later, on the server, once the session cookie exists. This is that hop.
 *
 * A placeholder profile is sent to onboarding with next= preserved — an invitee
 * arriving through /event/<id>?invite=<token> still lands on that event, with
 * the token, after choosing a handle. Everyone else goes straight to next.
 */
import { getConsumerProfile } from '@/lib/consumer';
import { isPlaceholderHandle, onboardingUrl, safeNextPath } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

/**
 * A RELATIVE redirect, on purpose. Every target here is a same-origin path,
 * and building an absolute URL from req.url is wrong behind a proxy: inside
 * the Coolify container req.url's origin is the bind address, and the first
 * deploy of this route sent every sign-in on production to
 * https://0.0.0.0:3000/… (measured, 0/6, minutes after it went live). A dev
 * server cannot catch that — localhost IS its origin. HTTP allows a relative
 * Location and browsers resolve it against the page they are on.
 */
function redirectTo(path: string): Response {
    return new Response(null, { status: 307, headers: { Location: path } });
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const next = safeNextPath(url.searchParams.get('next')) ?? '/me';

    // Staff/tenant doors have their own guards and never use placeholder
    // profiles for anything a member sees — pass them straight through.
    if (next.startsWith('/shop') || next.startsWith('/admin')) {
        return redirectTo(next);
    }

    let profile: { handle: string } | null = null;
    try {
        profile = await getConsumerProfile();
    } catch (e) {
        console.error('[auth/landing] profile read failed:', e instanceof Error ? e.message : e);
    }

    const target = profile && isPlaceholderHandle(profile.handle) ? onboardingUrl(next) : next;
    return redirectTo(target);
}
