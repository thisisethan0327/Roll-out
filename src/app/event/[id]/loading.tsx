/** Skeleton for /event/[id] while the meet + RSVP state resolve. */
import { Skeleton, SkeletonText } from '@/components/feedback';

export default function EventLoading() {
    return (
        <div className="glide glide-page">
            <div className="g-wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 760 }}>
                <Skeleton width={90} height={20} radius={999} style={{ marginBottom: 16 }} />
                <Skeleton width="80%" height={34} radius={12} style={{ marginBottom: 12 }} />
                <Skeleton width="50%" height={14} radius={7} style={{ marginBottom: 28 }} />
                <div className="g-card" style={{ padding: 20, marginBottom: 20 }}>
                    <SkeletonText lines={3} />
                </div>
                {/* RSVP control strip */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} width={116} height={48} radius={999} />
                    ))}
                </div>
            </div>
        </div>
    );
}
