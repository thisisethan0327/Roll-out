/**
 * Skeleton for the /me overview while its identity-scoped loaders resolve.
 * Renders inside the persistent MeNav shell so navigation reads as loading.
 */
import { Skeleton, SkeletonText, SkeletonHeading } from '@/components/feedback';

export default function MeLoading() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <SkeletonHeading label="LOADING YOUR ROLLOUT" />

            {/* Profile card */}
            <section style={{ display: 'flex', alignItems: 'center', gap: 18, border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 20 }}>
                <Skeleton width={64} height={64} radius="50%" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <Skeleton width={180} height={18} />
                    <Skeleton width={120} height={12} />
                </div>
            </section>

            {/* Quick links */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <Skeleton width="60%" height={10} />
                        <Skeleton width={40} height={24} />
                    </div>
                ))}
            </div>

            {/* Panels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                {Array.from({ length: 2 }).map((_, i) => (
                    <section key={i} style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
                        <Skeleton width="40%" height={10} style={{ marginBottom: 14 }} />
                        <SkeletonText lines={3} />
                    </section>
                ))}
            </div>
        </div>
    );
}
