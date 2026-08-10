/** Streaming skeleton for /store — hero band + one shop block of product cards. */
import { SkeletonStyle, Skel } from './_skeleton';

export default function StoreLoading() {
    return (
        <>
            <SkeletonStyle />
            <section style={{ background: 'linear-gradient(135deg, var(--gold) 0%, #000 62%)', borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ padding: '56px 0 40px' }}>
                    <Skel w={70} h={11} style={{ marginBottom: 16 }} />
                    <Skel w="min(360px, 70%)" h={48} style={{ marginBottom: 14 }} />
                    <Skel w="min(520px, 90%)" h={16} />
                    <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skel key={i} w={110} h={32} />
                        ))}
                    </div>
                </div>
            </section>
            <section className="section" style={{ padding: '40px 0 64px' }}>
                <div className="container">
                    <Skel w={220} h={24} style={{ marginBottom: 24 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} style={{ border: '1px solid var(--line)', overflow: 'hidden' }}>
                                <Skel h={undefined} style={{ aspectRatio: '1 / 1', border: 'none' }} />
                                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <Skel w="80%" h={15} />
                                    <Skel w={60} h={12} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}
