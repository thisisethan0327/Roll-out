/** Skeleton for /me/orders — the Medusa customer round-trip is the slowest /me
 *  fetch, so an immediate skeleton matters most here. */
import { PageHead, Skel } from '@/components/glide-tickets/parts';

export default function OrdersLoading() {
    return (
        <div className="glide glide-page gt-page--me" aria-busy="true">
            <PageHead title="Orders" sub={<Skel w={260} h={14} />} />
            <ul className="gt-list">
                {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i}>
                        <Skel h={186} r={28} />
                    </li>
                ))}
            </ul>
        </div>
    );
}
