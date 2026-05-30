import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ReviewReply } from './ReviewReply';

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
    const { data } = await admin
        .from('shop_review_cards')
        .select(
            'id, shop_id, rating, body, verified_purchase, owner_reply, created_at, reviewer_name, reviewer_handle, reviewer_is_verified',
        )
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });
    return ((data as any[]) ?? []) as ReviewRecord[];
}

function stars(rating: number): string {
    const r = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function reviewDate(iso: string | null): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'America/Los_Angeles',
        });
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
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">REVIEWS</div>
                    <div className="admin-page-sub">{shop.name.toUpperCase()} · RATINGS</div>
                </div>
            </div>

            <div className="admin-stat-grid">
                <div className="admin-stat">
                    <div className="admin-stat-lbl">TOTAL</div>
                    <div className="admin-stat-num">{total}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">AVG RATING</div>
                    <div className="admin-stat-num gold">{total ? avg.toFixed(1) : '—'}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">VERIFIED</div>
                    <div className="admin-stat-num">{verified}</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat-lbl">REPLIED</div>
                    <div className="admin-stat-num">{replied}</div>
                </div>
            </div>

            {reviews.length === 0 ? (
                <div className="admin-empty" style={{ marginTop: 16 }}>
                    No reviews yet.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    {reviews.map((rev) => (
                        <div
                            key={rev.id}
                            style={{ padding: '18px 20px', background: 'var(--bg-2)', border: '1px solid var(--line)' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <span className="accent" style={{ fontSize: 16, letterSpacing: 2 }}>{stars(rev.rating)}</span>
                                <span className="admin-handle">{reviewDate(rev.created_at)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 12 }}>
                                    {rev.reviewer_name || 'Someone'}
                                </span>
                                {rev.reviewer_handle ? <span className="admin-handle">@{rev.reviewer_handle}</span> : null}
                                {rev.verified_purchase ? <span className="admin-pill neon">VERIFIED</span> : null}
                            </div>
                            {rev.body ? (
                                <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, marginTop: 12, marginBottom: 0 }}>
                                    {rev.body}
                                </p>
                            ) : null}
                            <ReviewReply id={rev.id} shopId={rev.shop_id} ownerReply={rev.owner_reply} />
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
