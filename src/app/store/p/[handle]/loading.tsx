/** Streaming skeleton for the PDP — breadcrumb + gallery + info/buy column. */
import { SkeletonStyle, Skel } from '../../_skeleton';

export default function ProductLoading() {
    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <SkeletonStyle />
            <div className="container">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
                    <Skel w={160} h={11} />
                    <Skel w={70} h={11} />
                </div>
                <div
                    className="pdp-grid"
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 40, alignItems: 'start' }}
                >
                    {/* gallery */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Skel style={{ aspectRatio: '1 / 1' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skel key={i} style={{ aspectRatio: '1 / 1' }} />
                            ))}
                        </div>
                    </div>
                    {/* info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Skel w={90} h={11} />
                        <Skel w="70%" h={34} />
                        <Skel w={120} h={20} />
                        <Skel w="100%" h={14} />
                        <Skel w="92%" h={14} />
                        <Skel w="80%" h={14} style={{ marginBottom: 12 }} />
                        <Skel w="100%" h={52} />
                    </div>
                </div>
            </div>
        </section>
    );
}
