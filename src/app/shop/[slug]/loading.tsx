/**
 * Generic shop-console skeleton, in the shape of a Glide console page: the
 * page head, a count strip and a table card. Rendered inside the persistent
 * sidebar shell whenever navigation between sections is waiting on the
 * destination's server data. A tailored per-page loading.tsx can override
 * this by living deeper in the tree.
 */
import { Skeleton, SkeletonRows } from '@/components/feedback';

export default function ShopDashboardLoading() {
    return (
        <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Skeleton width={220} height={30} radius={8} />
                    <Skeleton width={280} height={12} radius={6} />
                </div>
                <Skeleton width={150} height={48} radius={24} />
            </div>
            <Skeleton height={76} radius={24} />
            <section className="g-card" style={{ padding: '20px 24px' }}>
                <SkeletonRows rows={6} cols={4} />
            </section>
        </div>
    );
}
