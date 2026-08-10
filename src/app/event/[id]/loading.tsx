/** Skeleton for /event/[id] while the meet + RSVP state resolve. */
import { Skeleton, SkeletonText } from '@/components/feedback';

export default function EventLoading() {
    return (
        <div className="container" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 760 }}>
            <Skeleton width={90} height={20} radius={999} style={{ marginBottom: 16 }} />
            <Skeleton width="80%" height={34} style={{ marginBottom: 12 }} />
            <Skeleton width="50%" height={14} style={{ marginBottom: 28 }} />
            <div style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16, marginBottom: 20 }}>
                <SkeletonText lines={3} />
            </div>
            {/* RSVP control strip */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} width={116} height={46} />
                ))}
            </div>
        </div>
    );
}
