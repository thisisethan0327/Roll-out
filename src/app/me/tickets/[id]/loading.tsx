/** Skeleton for a single /me/tickets/[id] detail while it and its chat load. */
import { Skeleton, SkeletonText, SkeletonCard } from '@/components/feedback';

export default function MyTicketDetailLoading() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="admin-page-head">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton width={160} height={22} />
                    <Skeleton width={240} height={12} />
                </div>
            </div>
            <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
                <SkeletonText lines={4} />
            </section>
            <SkeletonCard lines={3} />
        </div>
    );
}
