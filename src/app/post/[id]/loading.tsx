/** Skeleton for /post/[id] while the post resolves. */
import { Skeleton, SkeletonText } from '@/components/feedback';

export default function PostLoading() {
    return (
        <div className="container container-narrow" style={{ padding: '40px 0 48px' }}>
            <Skeleton width={140} height={12} style={{ marginBottom: 16 }} />
            <Skeleton width="90%" height={30} style={{ marginBottom: 12 }} />
            <Skeleton width="40%" height={12} style={{ marginBottom: 28 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SkeletonText lines={5} />
                <SkeletonText lines={4} lastWidth="45%" />
            </div>
        </div>
    );
}
