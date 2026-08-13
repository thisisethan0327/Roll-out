/**
 * /shop/[slug]/sell — "Sell on NeferStock" commerce-KYC application (P2 item 8).
 *
 * Gating (the layout already guarantees status='verified' — unverified shops get
 * the pending gate and never reach here):
 *   • eligible  = origin_app='neferstock' OR merchant_feature_enabled
 *                 → show the application form (or current commerce status)
 *   • ineligible→ the merchant-feature upsell screen (rollout-origin shop that
 *                 hasn't turned on the paid merchant add-on)
 *
 * commerce_status states:
 *   none            → application form
 *   pending         → "under review"
 *   docs_verified   → "you're selling" (interim tier)
 *   verified        → "you're selling"
 */
import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { SellForm } from './SellForm';

export const metadata = { title: 'Sell on NeferStock' };
export const dynamic = 'force-dynamic';

function Card({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children?: React.ReactNode }) {
    return (
        <div className="feature-card" style={{ maxWidth: 620, padding: '28px 24px' }}>
            <div className="eyebrow eyebrow-gold" style={{ marginBottom: 8 }}>{eyebrow}</div>
            <h2 style={{ fontSize: 22, letterSpacing: 0.4, margin: '0 0 8px' }}>{title}</h2>
            <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{body}</p>
            {children}
        </div>
    );
}

export default async function SellPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shops')
        .select('status, commerce_status, origin_app, merchant_feature_enabled')
        .eq('id', shop.shopId)
        .maybeSingle();
    if (error) console.error('[shop/sell] load shop commerce status failed:', error.message);
    const row = (data ?? {}) as any;
    const commerceStatus: string = row.commerce_status ?? 'none';
    const eligible = row.origin_app === 'neferstock' || row.merchant_feature_enabled === true;

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">SELL ON NEFERSTOCK</div>
                    <div className="admin-page-sub">{shop.name.toUpperCase()} · COMMERCE APPLICATION</div>
                </div>
                <Link href={`/shop/${slug}/overview`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>‹ BACK</Link>
            </div>

            {!eligible ? (
                <Card
                    eyebrow="／ MERCHANT FEATURE REQUIRED"
                    title="Unlock selling on NeferStock"
                    body="Your shop is verified on Rollout. Selling on NeferStock is a paid merchant add-on — once it’s enabled for your shop, the commerce application (business license, reseller certificate, UBI, and payouts) unlocks here. The merchant feature is rolling out soon."
                >
                    <div style={{ marginTop: 16 }}>
                        <a href="mailto:info@emwraps.net?subject=Merchant%20feature%20interest" className="admin-action-btn">CONTACT ABOUT SELLING</a>
                    </div>
                </Card>
            ) : commerceStatus === 'pending' ? (
                <Card
                    eyebrow="／ UNDER REVIEW"
                    title="Your seller application is being reviewed"
                    body="Thanks — we’ve got your documents. A Rollout admin is reviewing your commerce KYC. We’ll email you the moment it’s approved, and your catalog tools unlock."
                />
            ) : commerceStatus === 'docs_verified' || commerceStatus === 'verified' ? (
                <Card
                    eyebrow="／ APPROVED"
                    title="You’re cleared to sell"
                    body="Your commerce KYC is approved. You can list products and sell on NeferStock. Payouts move to Stripe Connect once the payouts platform is live; until then, approved sellers settle through Rollout’s interim process."
                >
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link href={`/shop/${slug}/products`} className="admin-action-btn" style={{ textDecoration: 'none' }}>MANAGE PRODUCTS</Link>
                    </div>
                </Card>
            ) : (
                <>
                    <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, maxWidth: 620, margin: '0 0 8px' }}>
                        Apply to sell your products on NeferStock. Upload your business license and reseller certificate, add your UBI, and we’ll review your commerce KYC. Documents are stored privately.
                    </p>
                    <SellForm shopId={shop.shopId} slug={slug} />
                </>
            )}
        </>
    );
}
