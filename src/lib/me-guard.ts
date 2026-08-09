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
    return profile;
}
