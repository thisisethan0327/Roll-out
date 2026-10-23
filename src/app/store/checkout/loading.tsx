/** Streaming skeleton for /store/checkout — the three steps and the order card. */
import { Skel } from '@/components/glide-tickets/parts';

export default function CheckoutLoading() {
    return (
        <div className="glide glide-page">
            <div className="g-wrap gt-page" aria-busy="true">
                <div className="gt-head">
                    <div className="gt-head-t">
                        <Skel w={80} h={14} />
                        <Skel w={260} h={42} style={{ marginTop: 12 }} />
                    </div>
                </div>
                <div className="gt-cols">
                    <div className="gt-steps">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="g-card gt-step">
                                <div className="gt-step-h">
                                    <Skel w={36} h={36} r={18} />
                                    <Skel w={200} h={18} />
                                </div>
                                {i === 0 ? (
                                    <div className="gt-step-body">
                                        <Skel h={60} r={20} />
                                        <Skel h={180} r={20} />
                                        <Skel h={56} r={28} />
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    <div className="g-card gt-cart-side">
                        <Skel w={90} h={20} />
                        <Skel h={48} />
                        <Skel h={14} />
                        <Skel h={14} />
                        <Skel h={20} />
                    </div>
                </div>
            </div>
        </div>
    );
}
