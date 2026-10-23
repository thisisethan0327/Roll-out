/**
 * /suspended — the ONE place a Rollout-banned member can be (Part 2, Ethan
 * 2026-10-09). The middleware, requireSession/requireConsumer and /auth/landing
 * all send them here; the dashboard, shop console, profile edits and account
 * deletion are closed (data and deletion requests go through support).
 *
 * It is the notice of the restriction (what, how long, the reason the admin
 * chose to share, what is closed) and the way out: one free appeal per
 * suspension, read by a person within 5 business days; paid-ticket and refund
 * status; sign out.
 *
 * Deliberately does NOT use requireConsumer (it would redirect here: a loop).
 * The ban state is read server-side from the session cookie via my_ban() on the
 * member's own session; nothing about the ban comes from the URL or the client.
 * A signed-out visitor goes to /login; a member who is not (or no longer) banned
 * goes to /me. Before migration 093 the page falls back to the 091 notice and
 * says appeals open soon.
 *
 * Sign-out is GLOBAL (Ethan's 2026-09-08 ruling) via the shared signOutAction.
 */
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
import { describeBanEnd, isProfileBanned } from '@/lib/ban';
import { loadMyBan } from '@/lib/my-ban';
import { signOutAction } from '@/app/me/actions';
import { SuspendedView } from './SuspendedView';

export const metadata = { title: 'Account suspended', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SuspendedPage() {
    const me = await getConsumerProfile();
    if (!me) redirect('/login');
    if (!isProfileBanned(me)) redirect('/me');

    const ban = await loadMyBan(me.profileId, me.bannedUntil);
    const end = describeBanEnd(ban.bannedUntil ?? me.bannedUntil);

    return <SuspendedView handle={me.handle} email={me.email} end={end} ban={ban} signOut={signOutAction} />;
}
