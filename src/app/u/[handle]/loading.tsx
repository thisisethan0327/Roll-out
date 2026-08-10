/** Skeleton for /u/[handle] public profile while it resolves. */
import { Skeleton, SkeletonText } from '@/components/feedback';

export default function ProfileLoading() {
    return (
        <div className="container" style={{ paddingTop: 64, paddingBottom: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
                <Skeleton width={88} height={88} radius="50%" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    <Skeleton width={220} height={26} />
                    <Skeleton width={140} height={14} />
                    <Skeleton width={300} height={12} />
                </div>
            </div>
            <div style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 20 }}>
                <SkeletonText lines={4} />
            </div>
        </div>
    );
}
