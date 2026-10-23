/** Skeleton for /me/tickets while the identity-scoped ticket loader resolves. */
import { PageHead, Skel } from '@/components/glide-tickets/parts';

export default function MyTicketsLoading() {
    return (
        <div className="glide glide-page gt-page--me" aria-busy="true">
            <PageHead title="Tickets" sub={<Skel w={220} h={14} />} />
            <ul className="gt-list">
                {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i}>
                        <Skel h={84} r={24} />
                    </li>
                ))}
            </ul>
        </div>
    );
}
