/** Streaming skeleton for /store/cart — heading + line-item rows + summary. */
import { SkeletonStyle, Skel } from '../_skeleton';

export default function CartLoading() {
    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <SkeletonStyle />
            <div className="container container-narrow">
                <Skel w={60} h={11} style={{ marginBottom: 16 }} />
                <Skel w={160} h={30} style={{ marginBottom: 28 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 14, border: '1px solid var(--line)' }}>
                            <Skel w={72} h={72} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Skel w="60%" h={15} />
                                <Skel w={70} h={13} />
                            </div>
                            <Skel w={90} h={30} />
                            <Skel w={60} h={16} />
                        </div>
                    ))}
                </div>
                <div style={{ borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Skel w="100%" h={14} />
                    <Skel w="100%" h={18} />
                </div>
            </div>
        </section>
    );
}
