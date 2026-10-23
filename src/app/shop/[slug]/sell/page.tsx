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
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { SellForm } from './SellForm';
import { CircleCheck, Clock, Lock, Mail } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { ConsoleHead } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';

export const metadata = { title: 'Sell on NeferStock' };
export const dynamic = 'force-dynamic';

/** A status card: icon roundel, state chip, heading, body and an optional action. */
function StateCard({
    icon,
    state,
    title,
    body,
    children,
    edge,
}: {
    icon: React.ReactNode;
    state: string;
    title: string;
    body: string;
    children?: React.ReactNode;
    edge?: boolean;
}) {
    return (
        <section className={`g-card ${edge ? 'g-edge' : ''} ${bz.narrow}`} aria-labelledby="sell-state-h">
            <div className={bz.stateCard}>
                <div className={bz.stateTop}>
                    <span className="g-ic" aria-hidden="true">
                        {icon}
                    </span>
                    <span className="g-chip">{state}</span>
                </div>
                <h2 id="sell-state-h" className={bz.stateH}>
                    {title}
                </h2>
                <p className={bz.stateP}>{body}</p>
                {children}
            </div>
        </section>
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
    const ic = { size: 22, strokeWidth: 1.75 } as const;

    return (
        <BizPage slug={slug}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/overview`, label: 'Overview' }}
                title="Sell on NeferStock"
                sub={`${shop.name} · Commerce application`}
            />

            {!eligible ? (
                <StateCard
                    icon={<Lock {...ic} />}
                    state="Merchant feature required"
                    title="Unlock selling on NeferStock"
                    body="Your shop is verified on Rollout. Selling on NeferStock is a paid merchant add-on — once it’s enabled for your shop, the commerce application (business license, reseller certificate, UBI, and payouts) unlocks here. The merchant feature is rolling out soon."
                >
                    <div className={bz.stateAct}>
                        <a href="mailto:info@emwraps.net?subject=Merchant%20feature%20interest" className={bz.act}>
                            <Mail size={17} strokeWidth={2} aria-hidden="true" />
                            Contact about selling
                        </a>
                    </div>
                </StateCard>
            ) : commerceStatus === 'pending' ? (
                <StateCard
                    icon={<Clock {...ic} />}
                    state="Under review"
                    title="Your seller application is being reviewed"
                    body="Thanks — we’ve got your documents. A Rollout admin is reviewing your commerce KYC. We’ll email you the moment it’s approved, and your catalog tools unlock."
                />
            ) : commerceStatus === 'docs_verified' || commerceStatus === 'verified' ? (
                <StateCard
                    edge
                    icon={<CircleCheck {...ic} />}
                    state="Approved"
                    title="You’re cleared to sell"
                    body="Your commerce KYC is approved. You can list products and sell on NeferStock. Payouts move to Stripe Connect once the payouts platform is live; until then, approved sellers settle through Rollout’s interim process."
                >
                    <div className={bz.stateAct}>
                        <GlideButton href={`/shop/${slug}/products`} size="sm">
                            Manage products
                        </GlideButton>
                    </div>
                </StateCard>
            ) : (
                <>
                    <p className={cs.small} style={{ maxWidth: '62ch', fontSize: 15 }}>
                        Apply to sell your products on NeferStock. Upload your business license and reseller certificate, add your UBI, and we’ll review your commerce KYC. Documents are stored privately.
                    </p>
                    <SellForm shopId={shop.shopId} slug={slug} />
                </>
            )}
        </BizPage>
    );
}
