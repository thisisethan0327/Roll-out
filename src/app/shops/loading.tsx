/** Skeleton for /shops (shop directory). */
import { Skeleton, SkeletonHeading } from '@/components/feedback';

export default function ShopsLoading() {
    return (
        <div className="container" style={{ padding: '64px 0 48px' }}>
            <SkeletonHeading label="LOADING SHOPS" />
            <Skeleton width={260} height={30} style={{ marginBottom: 28 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 150 }}>
                        <Skeleton width="70%" height={18} />
                        <Skeleton width="45%" height={12} />
                        <Skeleton width="60%" height={12} style={{ marginTop: 'auto' }} />
                    </div>
                ))}
            </div>
        </div>
    );
}
