/**
 * /shop/apply — public shop application (behind sign-in).
 *
 * ?origin=neferstock|rollout branches provenance; ?commerce=1 adds the commerce
 * (Sell on NeferStock) section so a single submission creates BOTH the shop and
 * commerce verification requests (founder's cross-platform amendment).
 *
 * The applicant must be a signed-in member; requireConsumer redirects to /login
 * with a next= back-link (and lazily mints their rollout profile).
 */
import type { Metadata } from 'next';
import { requireConsumer } from '@/lib/me-guard';
import { ApplyView } from './ApplyView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Apply — Put your shop on Rollout',
    description: 'Apply to list your shop on Rollout. Get on the map, take bookings, message customers, and sell.',
    // Behind sign-in (a visitor lands on /login): crawlable, never a search result.
    robots: { index: false, follow: true },
};

export default async function ShopApplyPage({
    searchParams,
}: {
    searchParams: Promise<{ origin?: string; commerce?: string }>;
}) {
    const sp = await searchParams;
    // Keep the selling variant through the sign-in round-trip (rerun 2026-09-06:
    // the login redirect dropped ?commerce=1 and the sell toggle was unreachable).
    const qs = new URLSearchParams();
    if (sp.origin) qs.set('origin', sp.origin);
    if (sp.commerce === '1') qs.set('commerce', '1');
    await requireConsumer('/shop/apply' + (qs.toString() ? '?' + qs.toString() : ''));
    const withCommerce = sp.commerce === '1';

    return <ApplyView withCommerce={withCommerce} />;
}
