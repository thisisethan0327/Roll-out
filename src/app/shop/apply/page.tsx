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
import { ApplyForm } from './ApplyForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Apply — Put your shop on Rollout',
    description: 'Apply to list your shop on Rollout. Get on the map, take bookings, message customers, and sell.',
};

export default async function ShopApplyPage({
    searchParams,
}: {
    searchParams: Promise<{ origin?: string; commerce?: string }>;
}) {
    await requireConsumer('/shop/apply');
    const sp = await searchParams;
    const withCommerce = sp.commerce === '1';

    return (
        // .light-scope forces this public applicant page into the shop console's
        // light token set (dark HUD stays everywhere else). The wrapper paints
        // --bg-0 edge to edge and full-height so the light surface fills past the
        // form column even though the marketing layout body is dark.
        <div className="light-scope" style={{ background: 'var(--bg-0)', minHeight: '100vh' }}>
            <section className="section" style={{ padding: '48px 0' }}>
                <div className="container" style={{ maxWidth: 680 }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ APPLY</div>
                    <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: 0.5, margin: '0 0 10px' }}>
                        {withCommerce ? 'SELL & LIST ON ROLLOUT' : 'PUT YOUR SHOP ON ROLLOUT'}
                    </h1>
                    <p style={{ color: 'var(--text-2)', fontSize: 15, marginTop: 0, marginBottom: 28, maxWidth: 560 }}>
                        Tell us about your shop. A Rollout admin reviews every application before it goes
                        live on the directory and map. {withCommerce ? 'Selling on NeferStock needs a quick KYC — start it below.' : ''}
                    </p>
                    <ApplyForm withCommerce={withCommerce} />
                </div>
            </section>
        </div>
    );
}
