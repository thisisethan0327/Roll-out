/**
 * /me — authenticated consumer portal shell.
 *
 * Gates the whole tree on a signed-in platform member (requireConsumer →
 * redirect to /login?next=/me when signed out) and renders the portal chrome
 * (its own top nav + sign-out) around every /me page. The marketing header is
 * suppressed on /me by MarketingChrome, so this is the only chrome here.
 *
 * Glide: the shell is a `.glide-page`, so the Glide palettes apply to the whole
 * body. Pages that have not been rebuilt yet still render through the legacy
 * variable bridge in src/styles/glide.css.
 */
import { requireConsumer } from '@/lib/me-guard';
import { headers } from 'next/headers';
import { MeNav } from './MeNav';
import { multiTicketsEnabled } from '@/lib/event-tickets';
import s from '@/components/glide-console/console.module.css';

export const metadata = { title: 'My Rollout' };
export const dynamic = 'force-dynamic';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
    // The leaf path (middleware stamps x-pathname) so a signed-out visitor to
    // /me/settings comes back to /me/settings, not /me.
    const stamped = (await headers()).get('x-pathname') ?? '';
    const nextPath = stamped.startsWith('/me') && !stamped.startsWith('//') ? stamped : '/me';
    const profile = await requireConsumer(nextPath);
    const ticketsEnabled = await multiTicketsEnabled();
    return (
        <div className={`glide glide-page ${s.shell}`}>
            <MeNav
                displayName={profile.displayName || profile.handle || 'Member'}
                handle={profile.handle}
                avatarUrl={profile.avatarUrl}
                isHost={profile.hostStatus === 'verified'}
                ticketsEnabled={ticketsEnabled}
            />
            <main className={`g-wrap ${s.main}`}>{children}</main>
        </div>
    );
}
