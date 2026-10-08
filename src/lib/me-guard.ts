/**
 * Auth guard for the /me consumer portal.
 *
 * Mirrors the shop-dashboard guard trust model but for the *member* surface:
 * a signed-in PLATFORM Supabase user (real auth.users row). When there is no
 * session we redirect to /login?next=<path> so the OTP form lands them back
 * where they intended. On success we return the member's rollout profile,
 * lazily minting one on first sight (getConsumerProfile) — a brand-new sign-up
 * with no prior activity still gets a working portal.
 *
 * Server-only. Downstream data loaders decide per-source whether RLS (anon SSR
 * client) or an explicit per-user service-role filter is the right enforcement.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { getConsumerProfile, type ConsumerProfile } from './consumer';
import { isPlaceholderHandle, isOnboardingPath, onboardingUrl } from './onboarding';
import { claimMyTicketsBestEffort } from './event-tickets';
import { isProfileBanned } from './ban';

/**
 * Ensure the caller is a signed-in member. Redirects to /login with a next=
 * back-link when not. `nextPath` should be the current /me route so the user
 * returns here after authenticating.
 */
export async function requireConsumer(nextPath: string = '/me'): Promise<ConsumerProfile> {
    const profile = await getConsumerProfile();
    if (!profile) {
        redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    // Rollout-banned (migration 091): the whole member area is closed. This is
    // the server-side gate, so a banned member is stopped here for every /me
    // page AND every server action behind requireConsumer / requireVerifiedHost
    // (host events, shop apply, become-host). /suspended explains why. Public
    // pages stay browsable. Before 091 nobody is banned, so this never fires.
    if (isProfileBanned(profile)) {
        redirect('/suspended');
    }
    // Still on the minted placeholder handle: finish onboarding first, then
    // come back here. /auth/landing catches this at sign-in; this catches a
    // member who signed in another day. Never from onboarding itself.
    if (isPlaceholderHandle(profile.handle) && !isOnboardingPath(nextPath)) {
        redirect(onboardingUrl(nextPath));
    }
    // Multi-ticket packages (feature-gated): every /me page goes through here,
    // which is the natural "the member's session/profile just resolved on the
    // server" hook the design doc asks for. Awaited (not fire-and-forget) so
    // it reliably completes even on serverless — but it can never fail this
    // call: claimMyTicketsBestEffort swallows every error internally and a
    // disabled feature short-circuits to a no-op before touching the network.
    await claimMyTicketsBestEffort();
    return profile;
}

/**
 * Ensure the caller is a signed-in member who is ALSO a verified individual
 * host (host_status = 'verified'). Non-hosts are bounced to the /me host
 * onboarding section rather than shown a 403 — the overview explains the states.
 * Used to gate /me/events (create/manage own no-shop events).
 */
export async function requireVerifiedHost(
    nextPath: string = '/me/events',
): Promise<ConsumerProfile> {
    const profile = await requireConsumer(nextPath);
    if (profile.hostStatus !== 'verified') {
        redirect('/me?host=not_verified');
    }
    return profile;
}
