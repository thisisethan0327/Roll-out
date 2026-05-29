import { requireShopMemberBySlug } from '@/lib/auth-guard';

export const metadata = { title: 'Billing' };

export default async function ShopBillingPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);
    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">BILLING</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · COMING SOON
                    </div>
                </div>
            </div>
            <div className="admin-empty">
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
                    BILLING &amp; SUBSCRIPTION MANAGEMENT COMING SOON
                </div>
                <div
                    style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: 'var(--text-3)',
                    }}
                >
                    Billing &amp; subscription management ships when Stripe Connect lands. Email{' '}
                    <a href="mailto:team@rollout.club" style={{ color: 'var(--gold)' }}>
                        team@rollout.club
                    </a>{' '}
                    to talk about your plan.
                </div>
            </div>
        </>
    );
}
