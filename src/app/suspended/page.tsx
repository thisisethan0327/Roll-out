/**
 * /suspended — where a Rollout-banned member lands (requireConsumer and
 * /auth/landing send them here). Explains the suspension, shows the end date
 * and the note the admin chose to share, and offers support + sign-out.
 *
 * Deliberately does NOT use requireConsumer (it would redirect here: a loop).
 * The ban state is read server-side from the session cookie; nothing about the
 * ban comes from the URL or the client. A signed-out visitor goes to /login; a
 * member who is not (or no longer) banned goes to /me.
 *
 * Sign-out is GLOBAL (Ethan's 2026-09-08 ruling) via the shared signOutAction.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
import { isProfileBanned, describeBanEnd, SUPPORT_EMAIL } from '@/lib/ban';
import { loadBanNotice } from '@/lib/ban-server';
import { signOutAction } from '@/app/me/actions';

export const metadata = { title: 'Account suspended', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SuspendedPage() {
    const me = await getConsumerProfile();
    if (!me) redirect('/login');
    if (!isProfileBanned(me)) redirect('/me');

    const notice = await loadBanNotice(me.profileId);
    const end = describeBanEnd(notice.bannedUntil ?? me.bannedUntil);
    const subject = encodeURIComponent(`Account suspension: @${me.handle}`);

    return (
        <div className="legal">
            <div className="container container-narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
                <div className="eyebrow eyebrow-gold mb-4">／ ACCOUNT SUSPENDED</div>
                <h1 style={{ marginBottom: 12 }}>Your account is suspended</h1>
                <p className="text-dim" style={{ fontSize: 17, marginBottom: 16 }}>
                    {end
                        ? `@${me.handle} is suspended on Rollout ${end}.`
                        : `@${me.handle} is suspended on Rollout.`}{' '}
                    You can still browse public pages, but you can&apos;t post, RSVP, book or use your member area
                    while the suspension is in place.
                </p>
                {notice.publicNote ? (
                    <p
                        style={{
                            fontSize: 16,
                            margin: '0 auto 16px',
                            maxWidth: 520,
                            padding: '12px 16px',
                            border: '1px solid var(--line)',
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {notice.publicNote}
                    </p>
                ) : null}
                <p className="text-dim" style={{ fontSize: 15, marginBottom: 40 }}>
                    Tickets you already paid for and events you host are untouched. If you think this is a mistake,
                    write to{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="text-link">
                        {SUPPORT_EMAIL}
                    </a>
                    .
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/" className="btn">
                        Back to base
                    </Link>
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="btn btn-ghost">
                        Contact support
                    </a>
                    <form action={signOutAction}>
                        <button type="submit" className="btn btn-ghost">
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
