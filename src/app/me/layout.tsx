/**
 * /me — authenticated consumer portal shell.
 *
 * Gates the whole tree on a signed-in platform member (requireConsumer →
 * redirect to /login?next=/me when signed out) and renders the portal chrome
 * (its own top nav + sign-out) around every /me page. The marketing header is
 * suppressed on /me by MarketingChrome, so this is the only chrome here.
 */
import { requireConsumer } from '@/lib/me-guard';
import { MeNav } from './MeNav';

export const metadata = { title: 'My Rollout' };
export const dynamic = 'force-dynamic';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
    const profile = await requireConsumer('/me');
    return (
        <>
            <MeNav displayName={profile.displayName || profile.handle || 'Member'} />
            <main className="container" style={{ paddingTop: 24, paddingBottom: 64 }}>
                {children}
            </main>
        </>
    );
}
