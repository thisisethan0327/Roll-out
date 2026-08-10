/** Skeleton for /meets (events list) — a force-dynamic route that queries
 *  events + RSVP counts, so a navigation here can otherwise sit blank. */
import { Skeleton, SkeletonHeading } from '@/components/feedback';

export default function MeetsLoading() {
    return (
        <div className="container" style={{ padding: '64px 0 48px' }}>
            <SkeletonHeading label="LOADING MEETS" />
            <Skeleton width={280} height={30} style={{ marginBottom: 28 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Skeleton width={72} height={20} radius={999} />
                        <Skeleton width="80%" height={18} />
                        <Skeleton width="55%" height={12} />
                        <Skeleton width="40%" height={12} />
                    </div>
                ))}
            </div>
        </div>
    );
}
