/** Skeleton for /me/tickets while the identity-scoped ticket loader resolves. */
import { Skeleton, SkeletonCard } from '@/components/feedback';

export default function MyTicketsLoading() {
    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">TICKETS</div>
                    <div className="admin-page-sub text-dim">
                        <Skeleton width={220} height={12} />
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} lines={1} />
                ))}
            </div>
        </div>
    );
}
