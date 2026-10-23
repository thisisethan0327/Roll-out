/** Streaming skeleton for /store/cart — title, line items and the summary. */
import { Skel } from '@/components/glide-tickets/parts';

export default function CartLoading() {
    return (
        <div className="glide glide-page">
            <div className="g-wrap gt-page" aria-busy="true">
                <div className="gt-head">
                    <div className="gt-head-t">
                        <Skel w={80} h={14} />
                        <Skel w={160} h={42} style={{ marginTop: 12 }} />
                    </div>
                </div>
                <div className="gt-cols">
                    <div className="g-card gt-cart">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="gt-ki">
                                <Skel w={72} h={72} r={18} />
                                <span className="gt-ki-t">
                                    <Skel w="60%" h={16} style={{ marginTop: 6 }} />
                                    <Skel w={70} h={13} style={{ marginTop: 10 }} />
                                    <Skel w={140} h={44} r={22} style={{ marginTop: 10 }} />
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="g-card gt-cart-side">
                        <Skel h={44} />
                        <Skel h={56} r={28} />
                    </div>
                </div>
            </div>
        </div>
    );
}
