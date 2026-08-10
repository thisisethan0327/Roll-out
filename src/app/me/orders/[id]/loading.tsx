/** Skeleton for a single /me/orders/[id] — the Medusa single-order round-trip
 *  (token exchange + expanded fetch) is slow, so feedback is immediate. */
import { Skeleton, SkeletonText, SkeletonCard, SkeletonRows } from '@/components/feedback';

export default function OrderDetailLoading() {
    return (
        <div>
            <div className="admin-page-head">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton width={90} height={12} />
                    <Skeleton width={160} height={22} />
                    <Skeleton width={220} height={12} />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
                <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
                    <Skeleton width="40%" height={10} style={{ marginBottom: 14 }} />
                    <SkeletonRows rows={3} cols={3} />
                </section>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <SkeletonCard lines={3} />
                    <SkeletonCard lines={2} />
                </div>
            </div>
            <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16, marginTop: 18 }}>
                <Skeleton width="40%" height={10} style={{ marginBottom: 14 }} />
                <SkeletonText lines={3} />
            </section>
        </div>
    );
}
