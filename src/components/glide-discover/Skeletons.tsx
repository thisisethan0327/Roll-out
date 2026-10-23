/**
 * Route loading states for the discover pages, in Glide: the same shapes as
 * the real pages (rounded cards, roundels, pills) in shimmering blocks, inside
 * a Glide scope so they paint in the chosen palette from the first frame.
 */
import './discover.css';
import { Skeleton, SkeletonText } from '@/components/feedback';

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="glide glide-page gd-page gd-skel" aria-busy="true">
            <div className="g-wrap">
                <span className="g-sr" role="status">
                    {label}
                </span>
                {children}
            </div>
        </div>
    );
}

function Head() {
    return (
        <div className="gd-head" aria-hidden="true">
            <div style={{ flex: 1 }}>
                <Skeleton width={220} height={48} radius={16} />
                <Skeleton width="min(520px, 80%)" height={16} radius={8} style={{ marginTop: 14 }} />
            </div>
            <Skeleton width={170} height={52} radius={26} />
        </div>
    );
}

function RowCard() {
    return (
        <div className="gd-meet" aria-hidden="true">
            <Skeleton width={132} height={96} radius={20} />
            <span className="gd-meet-t" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton width="70%" height={18} radius={8} />
                <Skeleton width="45%" height={12} radius={6} />
                <span style={{ display: 'flex', gap: 6 }}>
                    <Skeleton width={120} height={28} radius={14} />
                    <Skeleton width={80} height={28} radius={14} />
                </span>
            </span>
        </div>
    );
}

export function MeetsSkeleton() {
    return (
        <Shell label="Loading meets">
            <Head />
            <div className="gd-fchips" aria-hidden="true">
                {[60, 100, 84, 72, 100, 100].map((w, i) => (
                    <Skeleton key={i} width={w} height={44} radius={22} />
                ))}
            </div>
            <div className="gd-split">
                <div className="gd-meets">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <RowCard key={i} />
                    ))}
                </div>
                <div className="gd-split-map" aria-hidden="true" />
            </div>
        </Shell>
    );
}

export function MapSkeleton() {
    return (
        <Shell label="Loading the map">
            <div className="gd-mapx" aria-hidden="true">
                <div className="gd-mapx-top">
                    <Skeleton width={220} height={70} radius={24} />
                    <Skeleton width={170} height={52} radius={26} />
                </div>
            </div>
        </Shell>
    );
}

export function ShopsSkeleton() {
    return (
        <Shell label="Loading shops">
            <Head />
            <div className="gd-shops" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="gd-shop">
                        <Skeleton height={168} radius={23} style={{ width: '100%' }} />
                        <div className="gd-shop-tx" style={{ gap: 10 }}>
                            <Skeleton width="60%" height={22} radius={8} />
                            <Skeleton width="40%" height={12} radius={6} />
                            <span style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                <Skeleton width={110} height={28} radius={14} />
                                <Skeleton width={70} height={28} radius={14} />
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </Shell>
    );
}

export function ProfileSkeleton() {
    return (
        <Shell label="Loading the profile">
            <div className="gd-hero" aria-hidden="true">
                <div className="gd-id g-fp">
                    <div className="gd-id-top">
                        <Skeleton width={84} height={84} radius="50%" />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Skeleton width="70%" height={30} radius={10} />
                            <Skeleton width="45%" height={13} radius={6} />
                        </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                        <SkeletonText lines={2} />
                    </div>
                </div>
            </div>
            <div className="gd-prof" aria-hidden="true">
                <div className="gd-prof-main">
                    <div className="g-card g-card--pad">
                        <SkeletonText lines={4} />
                    </div>
                </div>
                <div className="gd-prof-side">
                    <div className="g-card g-card--pad">
                        <SkeletonText lines={3} />
                    </div>
                </div>
            </div>
        </Shell>
    );
}

export function PostSkeleton() {
    return (
        <Shell label="Loading the post">
            <div className="gd-post-wrap" aria-hidden="true">
                <div className="g-card gd-post">
                    <div className="gd-post-au">
                        <Skeleton width={48} height={48} radius="50%" />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Skeleton width={160} height={15} radius={7} />
                            <Skeleton width={120} height={12} radius={6} />
                        </div>
                    </div>
                    <div style={{ margin: '0 12px' }}>
                        <Skeleton height={360} radius={22} style={{ width: '100%' }} />
                    </div>
                    <div style={{ padding: '16px 24px 24px' }}>
                        <SkeletonText lines={3} lastWidth="45%" />
                    </div>
                </div>
            </div>
        </Shell>
    );
}
