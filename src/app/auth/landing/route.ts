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
import { NextResponse } from 'next/server';
import { getConsumerProfile } from '@/lib/consumer';
import { isPlaceholderHandle, onboardingUrl, safeNextPath } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const next = safeNextPath(url.searchParams.get('next')) ?? '/me';

    // Staff/tenant doors have their own guards and never use placeholder
    // profiles for anything a member sees — pass them straight through.
    if (next.startsWith('/shop') || next.startsWith('/admin')) {
        return NextResponse.redirect(new URL(next, url.origin));
    }

    let profile: { handle: string } | null = null;
    try {
        profile = await getConsumerProfile();
    } catch (e) {
        console.error('[auth/landing] profile read failed:', e instanceof Error ? e.message : e);
    }

    const target = profile && isPlaceholderHandle(profile.handle) ? onboardingUrl(next) : next;
    return NextResponse.redirect(new URL(target, url.origin));
}
