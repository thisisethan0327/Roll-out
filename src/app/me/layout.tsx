/**
 * /me — authenticated consumer portal shell.
 *
 * Gates the whole tree on a signed-in platform member (requireConsumer →
 * redirect to /login?next=/me when signed out) and renders the portal chrome
 * (its own top nav + sign-out) around every /me page. The marketing header is
 * suppressed on /me by MarketingChrome, so this is the only chrome here.
 */
import { requireConsumer } from '@/lib/me-guard';
import { headers } from 'next/headers';
import { MeNav } from './MeNav';

export const metadata = { title: 'My Rollout' };
export const dynamic = 'force-dynamic';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
    // The leaf path (middleware stamps x-pathname) so a signed-out visitor to
    // /me/settings comes back to /me/settings, not /me.
    const stamped = (await headers()).get('x-pathname') ?? '';
    const nextPath = stamped.startsWith('/me') && !stamped.startsWith('//') ? stamped : '/me';
    const profile = await requireConsumer(nextPath);
    return (
        <>
            <MeNav
                displayName={profile.displayName || profile.handle || 'Member'}
                isHost={profile.hostStatus === 'verified'}
            />
            <main className="container" style={{ paddingTop: 24, paddingBottom: 64 }}>
                {children}
            </main>
        </>
    );
}
