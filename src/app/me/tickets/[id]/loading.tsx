/** Skeleton for /me/tickets/[id] while the RLS-scoped ticket detail loads. */
import { Skel } from '@/components/glide-tickets/parts';

export default function TicketDetailLoading() {
    return (
        <div className="glide glide-page gt-page--me" aria-busy="true">
            <div className="gt-head">
                <div className="gt-head-t">
                    <Skel w={110} h={14} />
                    <Skel w={180} h={30} style={{ marginTop: 12 }} />
                    <Skel w={260} h={14} style={{ marginTop: 12 }} />
                </div>
            </div>
            <div className="gt-cols">
                <div className="gt-stack">
                    <Skel h={320} r={28} />
                    <Skel h={260} r={28} />
                </div>
                <div className="gt-stack">
                    <Skel h={200} r={28} />
                    <Skel h={160} r={28} />
                </div>
            </div>
        </div>
    );
}
