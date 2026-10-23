/**
 * Skeleton for the /me overview while its identity-scoped loaders resolve.
 * Renders inside the persistent MeNav shell, in the shape of the Glide page.
 */
import { Skeleton, SkeletonText } from '@/components/feedback';
import s from '@/components/glide-console/console.module.css';

function CardSkel({ rows = 3 }: { rows?: number }) {
    return (
        <section className="g-card" style={{ padding: '22px 24px 24px' }}>
            <Skeleton width="38%" height={18} radius={9} style={{ marginBottom: 18 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <Skeleton width={56} height={42} radius={14} />
                        <div style={{ flex: 1 }}>
                            <SkeletonText lines={2} gap={8} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function MeLoading() {
    return (
        <div className={s.scope} aria-busy="true" aria-label="Loading your Rollout">
            <div className={s.side}>
                <div className={s.col}>
                    <section className="g-card" style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                            <Skeleton width={76} height={76} radius="50%" style={{ margin: 8 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                                <Skeleton width="70%" height={24} radius={8} />
                                <Skeleton width="40%" height={12} radius={6} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                            <Skeleton height={48} radius={24} />
                            <Skeleton height={48} radius={24} />
                        </div>
                    </section>
                    <CardSkel rows={4} />
                </div>
                <div className={s.col}>
                    <CardSkel rows={3} />
                    <div className={s.g2}>
                        <CardSkel rows={2} />
                        <CardSkel rows={2} />
                    </div>
                </div>
            </div>
        </div>
    );
}
