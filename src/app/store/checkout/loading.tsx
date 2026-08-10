/** Streaming skeleton for /store/checkout — two-column steps + order summary. */
import { SkeletonStyle, Skel } from '../_skeleton';

export default function CheckoutLoading() {
    return (
        <section className="section" style={{ padding: '40px 0 72px' }}>
            <SkeletonStyle />
            <div className="container">
                <Skel w={80} h={11} style={{ marginBottom: 16 }} />
                <Skel w={200} h={30} style={{ marginBottom: 28 }} />
                <div
                    className="pdp-grid"
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 36, alignItems: 'start' }}
                >
                    {/* steps */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} style={{ border: '1px solid var(--line)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <Skel w={200} h={14} />
                                {i === 0 ? (
                                    <>
                                        <Skel w="100%" h={44} />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
                                            <Skel h={44} />
                                            <Skel h={44} />
                                        </div>
                                        <Skel w="100%" h={44} />
                                        <Skel w="100%" h={48} style={{ marginTop: 6 }} />
                                    </>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    {/* summary */}
                    <aside style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Skel w={70} h={11} />
                        <Skel w="100%" h={14} />
                        <Skel w="100%" h={14} />
                        <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Skel w="100%" h={13} />
                            <Skel w="100%" h={13} />
                            <Skel w="100%" h={18} />
                        </div>
                    </aside>
                </div>
            </div>
        </section>
    );
}
