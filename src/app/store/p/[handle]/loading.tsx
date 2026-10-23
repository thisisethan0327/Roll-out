/** Streaming skeleton for the PDP — breadcrumb, gallery card and the buy card. */
import { Skel } from '@/components/glide-tickets/parts';

export default function ProductLoading() {
    return (
        <div className="glide glide-page">
            <div className="g-wrap gt-page" aria-busy="true">
                <div className="gt-crumbs">
                    <Skel w={160} h={16} />
                    <Skel w={112} h={48} r={24} />
                </div>
                <div className="gt-pdp">
                    <div className="g-card gt-gal">
                        <Skel h={undefined} r={22} style={{ aspectRatio: '1 / 1' }} />
                    </div>
                    <div className="g-card gt-buy" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Skel w={140} h={32} r={16} />
                        <Skel w="75%" h={38} />
                        <Skel w={110} h={22} />
                        <Skel h={14} />
                        <Skel w="80%" h={14} />
                        <Skel h={56} r={28} style={{ marginTop: 8 }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
