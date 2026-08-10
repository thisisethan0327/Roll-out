/**
 * Generic shop-dashboard skeleton. Rendered inside the persistent ShopSidebar
 * shell (.admin-main) whenever navigation between dashboard sections is waiting
 * on the destination's server data (tickets, customers, calendar, products…).
 * A tailored per-page loading.tsx can override this by living deeper in the tree.
 */
import { Skeleton, SkeletonHeading, SkeletonRows } from '@/components/feedback';

export default function ShopDashboardLoading() {
    return (
        <div className="admin-content" style={{ padding: 24 }}>
            <SkeletonHeading label="LOADING" />
            <div className="admin-page-head" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton width={200} height={22} />
                    <Skeleton width={260} height={12} />
                </div>
                <Skeleton width={120} height={34} />
            </div>
            <div className="admin-table-wrap" style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
                <SkeletonRows rows={6} cols={4} />
            </div>
        </div>
    );
}
