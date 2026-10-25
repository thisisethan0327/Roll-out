import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { formatDateOnly } from '@/lib/event-time';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ReviewReply } from './ReviewReply';
import { BadgeCheck, MessageSquareText, Star } from 'lucide-react';
import { BizPage } from '@/components/glide-shopbiz/BizPage';
import { CardEmpty, CountStrip } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import { ConsoleHead } from '@/components/glide-console/parts';

export const metadata = { title: 'Reviews' };

type ReviewRecord = {
    id: string;
    shop_id: number;
    rating: number;
    body: string | null;
    verified_purchase: boolean | null;
    owner_reply: string | null;
    created_at: string | null;
    reviewer_name: string | null;
    reviewer_handle: string | null;
    reviewer_is_verified: boolean | null;
};

async function loadReviews(shopId: number): Promise<ReviewRecord[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('shop_review_cards')
        .select(
            'id, shop_id, rating, body, verified_purchase, owner_reply, created_at, reviewer_name, reviewer_handle, reviewer_is_verified',
        )
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });
    if (error) console.error('[shop/reviews] loadReviews failed:', error.message);
    return ((data as any[]) ?? []) as ReviewRecord[];
}

function stars(rating: number) {
    const n = Math.max(0, Math.min(5, Math.round(Number(rating))));
    return (
        <span className={bz.stars} role="img" aria-label={`${n} out of 5 stars`}>
            {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} size={18} strokeWidth={2} aria-hidden="true" fill={i < n ? 'currentColor' : 'none'} className={i < n ? undefined : bz.off} />
            ))}
        </span>
    );
}

function reviewDate(iso: string | null): string {
    if (!iso) return '';
    try {
        return formatDateOnly(iso);
    } catch {
        return '';
    }
}

export default async function ShopReviewsPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    const reviews = await loadReviews(shop.shopId);

    const total = reviews.length;
    const avg = total ? reviews.reduce((s, r) => s + Number(r.rating), 0) / total : 0;
    const verified = reviews.filter((r) => r.verified_purchase).length;
    const replied = reviews.filter((r) => r.owner_reply).length;

    return (
        <BizPage slug={slug}>
            <ConsoleHead title="Reviews" sub={`${shop.name} · Ratings`} />

            <CountStrip
                label="Review totals"
                items={[
                    { label: 'Total', value: total },
                    { label: 'Avg rating', value: total ? avg.toFixed(1) : '—' },
                    { label: 'Verified', value: verified },
                    { label: 'Replied', value: replied },
                ]}
            />

            {reviews.length === 0 ? (
                <section className="g-card">
                    <CardEmpty
                        icon={<MessageSquareText size={22} strokeWidth={1.75} />}
                        title="No reviews yet"
                    />
                </section>
            ) : (
                <ul className={bz.reviews}>
                    {reviews.map((rev) => (
                        <li key={rev.id}>
                            <article className={`g-card ${bz.rev}`} aria-label={`Review by ${rev.reviewer_name || 'someone'}`}>
                                <div className={bz.revTop}>
                                    {stars(rev.rating)}
                                    <span className={bz.date}>{reviewDate(rev.created_at)}</span>
                                </div>
                                <p className={bz.revWho}>
                                    {rev.reviewer_name || 'Someone'}
                                    {rev.reviewer_handle ? <span>@{rev.reviewer_handle}</span> : null}
                                    {rev.verified_purchase ? (
                                        <span className="g-chip g-chip--tint">
                                            <BadgeCheck size={14} strokeWidth={2} aria-hidden="true" />
                                            Verified
                                        </span>
                                    ) : null}
                                </p>
                                {rev.body ? <p className={bz.revBody}>{rev.body}</p> : null}
                                <ReviewReply id={rev.id} shopId={rev.shop_id} ownerReply={rev.owner_reply} />
                            </article>
                        </li>
                    ))}
                </ul>
            )}
        </BizPage>
    );
}
