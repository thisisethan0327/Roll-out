/** Skeleton for /me/garage (vehicle list). */
import { Skeleton, SkeletonCard } from '@/components/feedback';

export default function MyGarageLoading() {
    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">GARAGE</div>
                    <div className="admin-page-sub text-dim">
                        <Skeleton width={220} height={12} />
                    </div>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={i} lines={2} />
                ))}
            </div>
        </div>
    );
}
