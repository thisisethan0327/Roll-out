/** Skeleton for /me/orders — the Medusa customer round-trip is the slowest /me
 *  fetch, so an immediate skeleton matters most here. */
import { Skeleton, SkeletonCard } from '@/components/feedback';

export default function OrdersLoading() {
    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">ORDERS</div>
                    <div className="admin-page-sub text-dim">
                        <Skeleton width={220} height={12} />
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={i} lines={2} />
                ))}
            </div>
        </div>
    );
}
